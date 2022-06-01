import powerbi from 'powerbi-visuals-api';
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import { getValue, getColumnnColorByIndex, getAxisTextFillColor, getPlotFillColor, getColorSettings, getCategoricalObjectColor } from './objectEnumerationUtility';
import { ViewModel, DataPoint, FormatSettings, PlotSettings, PlotModel, TooltipDataPoint, XAxisData, YAxisData, PlotType, SlabRectangle, SlabType, GeneralPlotSettings, Margins, AxisInformation, AxisInformationInterface, TooltipModel, ZoomingSettings, LegendData, Legend, LegendValue, TooltipData, TooltipColumnData, RolloutRectangles, XAxisSettings } from './plotInterface';
import { Color, scaleLinear, stratify } from 'd3';
import { AxisSettingsNames, PlotSettingsNames, Settings, ColorSettingsNames, OverlayPlotSettingsNames, PlotTitleSettingsNames, TooltipTitleSettingsNames, YRangeSettingsNames, ZoomingSettingsNames, LegendSettingsNames, AxisLabelSettingsNames, HeatmapSettingsNames, ArrayConstants } from './constants';
import { Heatmapmargins, MarginSettings } from './marginSettings'
import { ok, err, Result } from 'neverthrow'
import { AxisError, AxisNullValuesError, GetAxisInformationError, NoAxisError, NoValuesError, ParseAndTransformError, PlotLegendError, PlotSizeError, SVGSizeError } from './errors'
import { isString } from 'vega';

// TODO #n: Allow user to change bars colors

/**
 * Function that converts queried data into a viewmodel that will be used by the visual.
 *
 * @function
 * @param {VisualUpdateOptions} options - Contains references to the size of the container
 *                                        and the dataView which contains all the data
 *                                        the visual had queried.
 * @param {IVisualHost} host            - Contains references to the host which contains services
 */

function f(): number {
    return 2;
}

export function visualTransform(options: VisualUpdateOptions, host: IVisualHost): Result<ViewModel, ParseAndTransformError> {

    // try {
    const dataViews = options.dataViews;
    if (!dataViews || !dataViews[0] || !dataViews[0].categorical || !dataViews[0].metadata) {
        return err(new ParseAndTransformError("No categorical data in Axis or Values"));
    };
    const objects = dataViews[0].metadata.objects;
    const categorical = dataViews[0].categorical;
    const metadataColumns = dataViews[0].metadata.columns;
    const colorPalette: ISandboxExtendedColorPalette = host.colorPalette;

    //count numbers of x-axis, y-axis and tooltipdata
    const yCategoriesCount = categorical.categories === undefined ? 0 : categorical.categories.filter(cat => { return cat.source.roles.y_axis }).length;
    const yValuesCount = categorical.values === undefined ? 0 : categorical.values.filter(val => { return val.source.roles.y_axis }).length;
    const yCount = yCategoriesCount + yValuesCount;
    const xCategoriesCount = categorical.categories === undefined ? 0 : categorical.categories.filter(cat => { return cat.source.roles.x_axis }).length;
    const xValuesCount = categorical.values === undefined ? 0 : categorical.values.filter(val => { return val.source.roles.x_axis }).length;
    const xCount = xCategoriesCount + xValuesCount;
    const tooltipCategoriesCount = categorical.categories === undefined ? 0 : categorical.categories.filter(cat => { return cat.source.roles.tooltip }).length;
    const tooltipValuesCount = categorical.values === undefined ? 0 : categorical.values.filter(val => { return val.source.roles.tooltip }).length;
    const tooltipCount = tooltipCategoriesCount + tooltipValuesCount;
    const sharedXAxis = xCount == 1;
    // const yCategoriesCount = categorical.categories === undefined ? 0 : new Set(categorical.categories.filter(cat => { return cat.source.roles.y_axis }).map(x => x.source.index)).size;
    // const yValuesCount = categorical.values === undefined ? 0 : new Set(categorical.values.filter(val => { return val.source.roles.y_axis }).map(x => x.source.index)).size;
    // const yCount = yCategoriesCount + yValuesCount;
    // const xCategoriesCount = categorical.categories === undefined ? 0 : new Set(categorical.categories.filter(cat => { return cat.source.roles.x_axis }).map(x => x.source.index)).size;
    // const xValuesCount = categorical.values === undefined ? 0 : new Set(categorical.values.filter(val => { return val.source.roles.x_axis }).map(x => x.source.index)).size;
    // const xCount = xCategoriesCount + xValuesCount;
    // const tooltipCategoriesCount = categorical.categories === undefined ? 0 : new Set(categorical.categories.filter(cat => { return cat.source.roles.tooltip }).map(x => x.source.index)).size;
    // const tooltipValuesCount = categorical.values === undefined ? 0 : new Set(categorical.values.filter(val => { return val.source.roles.tooltip }).map(x => x.source.index)).size;
    // const tooltipCount = tooltipCategoriesCount + tooltipValuesCount;
    // console.log(tooltipCount);
    // const sharedXAxis = xCount == 1

    //check if input data count is ok
    if (yCount == 0) {
        return err(new NoValuesError());
    }
    if (xCount == 0) {
        return err(new NoAxisError());
    }
    if (xCount != yCount && !sharedXAxis) {
        return err(new AxisError());
    }

    let xData: XAxisData;
    let yData = new Array<YAxisData>(yCount);
    let tooltipData = new Array<TooltipColumnData>(tooltipCount);
    let legendData: LegendData = null;
    // let defectIndices: DefectIndices = new DefectIndices();


    let xDataPoints: number[] = [];
    let yDataPoints: number[] = [];
    let dataPoints: DataPoint[] = [];
    let slabWidth: number[] = [];
    let slabLength: number[] = [];
    let legend: Legend = null;
    let rolloutRectangles: number[];

    //aquire all categorical values
    if (categorical.categories !== undefined) {
        for (let category of categorical.categories) {
            const roles = category.source.roles;
            if (roles.x_axis) {
                xData = {
                    name: category.source.displayName,
                    values: <number[]>category.values
                };
            }
            if (roles.y_axis) {
                let yId = category.source['rolesIndex']['y_axis'][0];
                let yAxis: YAxisData = {
                    name: category.source.displayName,
                    values: <number[]>category.values,
                    columnId: category.source.index
                };
                yData[yId] = yAxis;
            }
            if (roles.slabX) {
                slabLength = <number[]>category.values;
            }
            if (category.source.roles.slabY) {
                slabWidth = <number[]>category.values;
            }
            if (roles.tooltip) {

                let columnId = category.source.index;
                if (!metadataColumns[columnId]) {
                    columnId = categorical.values.filter(x => x.source.displayName === category.source.displayName)[0].source.index;
                }
                const tooltipId = category.source['rolesIndex']['tooltip'][0];
                let data: TooltipColumnData = {
                    type: category.source.type,
                    name: category.source.displayName,
                    values: <number[]>category.values,
                    columnId
                };
                tooltipData[tooltipId] = data;
            }
            if (roles.legend) {
                legendData = {
                    name: category.source.displayName,
                    values: <string[]>category.values,
                    columnId: category.source.index
                };
            }
            // if (roles.defectIndices) {
            //     defectIndices.defectIndices.set(category.source.displayName, <number[]>category.values)
            // }
            if (roles.rollout) {
                rolloutRectangles = <number[]>category.values
            }
        }
    }
    //aquire all measure values
    if (categorical.values !== undefined) {
        for (let value of categorical.values) {
            const roles = value.source.roles
            if (roles.x_axis) {
                xData = {
                    name: value.source.displayName,
                    values: <number[]>value.values
                };

            }
            if (roles.y_axis) {
                const yId = value.source['rolesIndex']['y_axis'][0]
                let yAxis: YAxisData = {
                    name: value.source.displayName,
                    values: <number[]>value.values,
                    columnId: value.source.index
                }
                yData[yId] = yAxis;
            }
            if (roles.slabX) {
                slabLength = <number[]>value.values;
            }
            if (roles.slabY) {
                slabWidth = <number[]>value.values;
            }
            if (roles.tooltip) {
                let columnId = value.source.index;
                if (!metadataColumns[columnId]) {
                    columnId = categorical.categories.filter(x => x.source.displayName === value.source.displayName)[0].source.index;
                }

                const tooltipId = value.source['rolesIndex']['tooltip'][0];
                let data: TooltipColumnData = {
                    type: value.source.type,
                    name: value.source.displayName,
                    values: <number[]>value.values,
                    columnId
                };
                tooltipData[tooltipId] = data;
            }
            if (roles.legend) {
                legendData = {
                    name: value.source.displayName,
                    values: <string[]>value.values,
                    columnId: value.source.index
                };
            }
            // if (roles.defectIndices) {
            //     defectIndices.defectIndices.set(value.source.displayName, <number[]>value.values);
            // }
            if (roles.rollout) {
                rolloutRectangles = <number[]>value.values
            }

        }
    }




    const possibleNullValues = xData.values.filter(y => y === null || y === undefined)
    if (possibleNullValues.length > 0) {
        return err(new AxisNullValuesError(xData.name));
    }

    const legendColors = ArrayConstants.legendColors;
    if (legendData != null) {
        let categories = categorical.categories.filter(x => x.source.roles.legend)
        let category = categories.length > 0 ? categories[0] : null;
        let legendSet = new Set(legendData.values);
        const defaultLegendName = category ? category.source.displayName : "Legend";

        if (legendSet.has(null)) {
            legendSet.delete(null);
        }
        let legendValues = Array.from(legendSet);
        legend = {
            legendDataPoints: [],
            legendValues: [],
            legendTitle: <string>getValue(objects, Settings.legendSettings, LegendSettingsNames.legendTitle, defaultLegendName),
            legendXLength:0
        }
        for (let i = 0; i < legendValues.length; i++) {
            const val = legendValues[i]
            const defaultColor = legendColors[val] ? legendColors[val] : "FFFFFF"
            const selectionId = category ? host.createSelectionIdBuilder().withCategory(category, i).createSelectionId() : host.createSelectionIdBuilder().createSelectionId();

            legend.legendValues.push({
                color: getCategoricalObjectColor(category, i, Settings.legendSettings, LegendSettingsNames.legendColor, defaultColor),
                selectionId: selectionId,
                value: val
            });
        }

        for (let i = 0; i < Math.min(legendData.values.length, xData.values.length); i++) {
            legend.legendDataPoints.push({
                xValue: xData.values[i],
                yValue: legendData.values[i]
            });

        }


    }
    let formatSettings: FormatSettings[] = [];
    let plotTitles: string[] = [];
    let plotSettings: PlotSettings[] = [];

    for (let plotNr = 0; plotNr < yCount; plotNr++) {
        let yAxis: YAxisData = yData[plotNr]
        let yColumnId = yData[plotNr].columnId;
        let yColumnObjects = metadataColumns[yColumnId].objects;
        plotTitles.push(getValue<string>(yColumnObjects, Settings.plotTitleSettings, PlotTitleSettingsNames.title, yAxis.name))

        const xInformation: AxisInformation = AxisInformation[getValue<string>(yColumnObjects, Settings.axisSettings, AxisSettingsNames.xAxis, AxisInformation.None)]
        const yInformation: AxisInformation = AxisInformation[getValue<string>(yColumnObjects, Settings.axisSettings, AxisSettingsNames.yAxis, AxisInformation.Ticks)]
        let xAxisInformation: AxisInformationInterface, yAxisInformation: AxisInformationInterface;
        let axisInformationError: ParseAndTransformError;
        getAxisInformation(xInformation)
            .map(inf => xAxisInformation = inf)
            .mapErr(err => axisInformationError = err);
        getAxisInformation(yInformation)
            .map(inf => yAxisInformation = inf)
            .mapErr(err => axisInformationError = err);
        if (axisInformationError) {
            return err(axisInformationError);
        }
        formatSettings.push({
            axisSettings: {
                xAxis: xAxisInformation,
                yAxis: yAxisInformation
            },
        });


        plotSettings.push({
            plotSettings: {
                fill: getPlotFillColor(yColumnObjects, colorPalette, '#000000'),
                plotType: PlotType[getValue<string>(yColumnObjects, Settings.plotSettings, PlotSettingsNames.plotType, PlotType.LinePlot)],
                useLegendColor: getValue<boolean>(yColumnObjects, Settings.plotSettings, PlotSettingsNames.useLegendColor, false),
                showHeatmap: <boolean>getValue(yColumnObjects, Settings.plotSettings, PlotSettingsNames.showHeatmap, false)
            }
        });
    }
    const plotTitlesCount = plotTitles.filter(x => x.length > 0).length;
    const xLabelsCount = formatSettings.filter(x => x.axisSettings.xAxis.lables && x.axisSettings.xAxis.ticks).length;
    const heatmapCount = plotSettings.filter(x => x.plotSettings.showHeatmap).length;
    let viewModel: ViewModel;
    let viewModelResult = createViewModel(options, yCount, objects, colorPalette, plotTitlesCount, xLabelsCount, heatmapCount, legend, xData)
        .map(vm => viewModel = vm)
    if (viewModelResult.isErr()) {
        return viewModelResult.mapErr(err => { return err; });
    }

    createTooltipModels(sharedXAxis, xData, tooltipData, viewModel, metadataColumns);
    createSlabInformation(slabLength, slabWidth, xData.values, viewModel);


    let plotTop = MarginSettings.svgTopPadding + MarginSettings.margins.top;
    //create Plotmodels
    for (let plotNr = 0; plotNr < yCount; plotNr++) {
        //get x- and y-data for plotnumber
        let yAxis: YAxisData = yData[plotNr]
        xDataPoints = xData.values
        yDataPoints = yAxis.values;
        const maxLengthAttributes = Math.max(xDataPoints.length, yDataPoints.length);
        dataPoints = [];
        const yColumnId = yData[plotNr].columnId;
        const yColumnObjects = metadataColumns[yColumnId].objects;
        const plotSettings: PlotSettings = {
            plotSettings: {
                fill: getPlotFillColor(yColumnObjects, colorPalette, '#000000'),
                plotType: PlotType[getValue<string>(yColumnObjects, Settings.plotSettings, PlotSettingsNames.plotType, PlotType.LinePlot)],
                useLegendColor: getValue<boolean>(yColumnObjects, Settings.plotSettings, PlotSettingsNames.useLegendColor, false),
                showHeatmap: <boolean>getValue(yColumnObjects, Settings.plotSettings, PlotSettingsNames.showHeatmap, false)
            }
        }
        //create datapoints
        for (let pointNr = 0; pointNr < maxLengthAttributes; pointNr++) {
            const selectionId: ISelectionId = host.createSelectionIdBuilder().withMeasure(xDataPoints[pointNr].toString()).createSelectionId();
            let color = plotSettings.plotSettings.fill;
            const xVal = xDataPoints[pointNr];
            if (plotSettings.plotSettings.useLegendColor) {
                if (legend != null) {
                    const legendVal = legend.legendDataPoints.find(x => x.xValue == xVal).yValue;
                    color = legendVal == null ? color : legend.legendValues.find(x => x.value == legendVal).color;
                } else {
                    return err(new PlotLegendError(yAxis.name));
                }
            }

            //const color = legend.legendValues.fin legend.legendDataPoints[pointNr].yValue
            let dataPoint: DataPoint = {
                xValue: xVal,
                yValue: yDataPoints[pointNr],
                identity: selectionId,
                selected: false,
                color: color
            };
            dataPoints.push(dataPoint);
        }



        // dataPoints = dataPoints.sort((a: DataPoint, b: DataPoint) => {
        //     return <number>a.xValue - <number>b.xValue;
        // });


        let plotTitle = plotTitles[plotNr]
        plotTop = plotTitle.length > 0 ? plotTop + MarginSettings.plotTitleHeight : plotTop;



        let plotModel: PlotModel = {
            plotId: plotNr,
            formatSettings: formatSettings[plotNr],

            yName: yAxis.name,
            labelNames: {
                xLabel: getValue<string>(yColumnObjects, Settings.axisLabelSettings, AxisLabelSettingsNames.xLabel, xData.name),
                yLabel: getValue<string>(yColumnObjects, Settings.axisLabelSettings, AxisLabelSettingsNames.yLabel, yAxis.name),
            },
            plotTop: plotTop,
            plotSettings: plotSettings,
            plotTitleSettings: {
                title: plotTitle//getValue<string>(yColumnObjects, Settings.plotTitleSettings, PlotTitleSettingsNames.title, yAxis.name)
            },
            overlayPlotSettings: {
                overlayPlotSettings: {
                    slabType: SlabType[getValue<string>(yColumnObjects, Settings.overlayPlotSettings, OverlayPlotSettingsNames.slabType, SlabType.None)]
                }
            },
            yRange: {
                min: getValue<number>(yColumnObjects, Settings.yRangeSettings, YRangeSettingsNames.min, 0),//TODO: default Math.min(...yDataPoints)?
                max: getValue<number>(yColumnObjects, Settings.yRangeSettings, YRangeSettingsNames.max, Math.max(...yDataPoints)),
            },
            dataPoints: dataPoints,
            d3Plot: null
        };
        viewModel.plotModels[plotNr] = plotModel;
        const formatXAxis = plotModel.formatSettings.axisSettings.xAxis
        plotTop = formatXAxis.lables && formatXAxis.ticks ? plotTop + MarginSettings.xLabelSpace : plotTop;
        plotTop += viewModel.generalPlotSettings.plotHeight + MarginSettings.margins.top + MarginSettings.margins.bottom;
        plotTop += plotModel.plotSettings.plotSettings.showHeatmap ? Heatmapmargins.heatmapSpace : 0;
    }
    if (rolloutRectangles) {
        const rolloutY = viewModel.plotModels[0].plotTop;
        const rolloutHeight = viewModel.plotModels[viewModel.plotModels.length - 1].plotTop + viewModel.generalPlotSettings.plotHeight - rolloutY;
        viewModel.rolloutRectangles = new RolloutRectangles(xData.values, rolloutRectangles, rolloutY, rolloutHeight);
    }

    viewModel.generalPlotSettings.legendYPostion = plotTop;

    return ok(viewModel);

}

function createTooltipModels(sharedXAxis: boolean, xData: XAxisData, tooltipData: TooltipColumnData[], viewModel: ViewModel, metadataColumns: powerbi.DataViewMetadataColumn[]): void {
    if (sharedXAxis) {
        for (const tooltip of tooltipData) {
            const column: powerbi.DataViewMetadataColumn = metadataColumns[tooltip.columnId];
            const maxLengthAttributes: number = Math.min(xData.values.length, tooltip.values.length);

            let tooltipPoints: TooltipDataPoint[] = <TooltipDataPoint[]>[];
            const type = tooltip.type;
            if (type.dateTime) {
                tooltip.values = tooltip.values.map(val => {
                    if (!isString(val)) {
                        console.log("Type is no date, this should not have happened: " + column.displayName);
                        return val;
                    }
                    let d = new Date(<string>val);
                    let formatedDate = padTo2Digits(d.getDate()) + "." + padTo2Digits(d.getMonth() + 1) + "." + padTo2Digits(d.getFullYear()) + " " + padTo2Digits(d.getHours()) + ":" + padTo2Digits(d.getMinutes())
                    return formatedDate;
                });
            } else if (type.numeric && !type.integer) {
                tooltip.values = tooltip.values.map(val => {
                    if (typeof val === 'number') {
                        return Number(val).toFixed(2);
                    }
                    return val
                });
            }

            //create datapoints
            for (let pointNr = 0; pointNr < maxLengthAttributes; pointNr++) {
                let dataPoint: TooltipDataPoint = {
                    xValue: xData.values[pointNr],
                    yValue: tooltip.values[pointNr]
                };
                tooltipPoints.push(dataPoint);
            }
            let tooltipModel: TooltipModel = {
                tooltipName: getValue<string>(column.objects, Settings.tooltipTitleSettings, TooltipTitleSettingsNames.title, column.displayName),
                tooltipId: tooltip.columnId,
                tooltipData: tooltipPoints
            };
            viewModel.tooltipModels.push(tooltipModel);
        }
    }
}

function createSlabInformation(slabLength: number[], slabWidth: number[], xValues: number[], viewModel: ViewModel): void {
    if (slabLength.length == slabWidth.length && slabWidth.length > 0) {
        let slabRectangles: SlabRectangle[] = new Array<SlabRectangle>(slabLength.length);
        for (let i = 0; i < slabLength.length; i++) {
            slabRectangles[i] = {
                width: slabWidth[i],
                length: slabLength[i],
                y: 0,
                x: xValues[i]
            };
        }
        slabRectangles = slabRectangles.filter(x => x.x != null && x.x > 0 && x.width != null && x.width > 0);
        if (slabRectangles.length == 0) {
            //TODO: create error on wrong data?
            return;
        }
        // let lastX = slabRectangles[0].x;
        // slabRectangles[0].length = lastX;
        // slabRectangles[0].x = 0;
        // for (let i = 1; i < slabRectangles.length; i++) {
        //     slabRectangles[i].length = slabRectangles[i].x - lastX;
        //     lastX = slabRectangles[i].x;
        //     slabRectangles[i].x = lastX - slabRectangles[i].length;
        // }
        viewModel.slabRectangles = slabRectangles;
    }
}

function createViewModel(options: VisualUpdateOptions, yCount: number, objects: powerbi.DataViewObjects, colorPalette: ISandboxExtendedColorPalette, plotTitlesCount: number, xLabelsCount: number, heatmapCount: number, legend: Legend, xData: XAxisData): Result<ViewModel, ParseAndTransformError> {
    const margins = MarginSettings
    const svgHeight: number = options.viewport.height;
    const svgWidth: number = options.viewport.width;
    const legendHeight = legend ? margins.legendHeight : 0;
    if (svgHeight === undefined || svgWidth === undefined || !svgHeight || !svgWidth) {
        return err(new SVGSizeError());
    }
    const plotHeightSpace: number = (svgHeight - margins.svgTopPadding - margins.svgBottomPadding - legendHeight - margins.plotTitleHeight * plotTitlesCount - margins.xLabelSpace * xLabelsCount - Heatmapmargins.heatmapSpace * heatmapCount) / yCount;
    if (plotHeightSpace < margins.miniumumPlotHeight) {
        return err(new PlotSizeError("vertical"));
    }
    const plotWidth: number = svgWidth - margins.margins.left - margins.margins.right;
    if (plotWidth < margins.miniumumPlotWidth) {
        return err(new PlotSizeError("horizontal"));
    }
    const xRange = {
        min: Math.min(...xData.values),
        max: Math.max(...xData.values),
    }

    const xAxisSettings = <XAxisSettings>{
        xName: xData.name,
        xRange: xRange,
        xScale: scaleLinear().domain([xRange.min, xRange.max]).range([0, plotWidth])
    }
    let generalPlotSettings: GeneralPlotSettings = {
        plotTitleHeight: margins.plotTitleHeight,
        dotMargin: margins.dotMargin,
        plotHeight: plotHeightSpace - margins.margins.top - margins.margins.bottom,
        plotWidth: plotWidth,
        legendHeight: legendHeight,
        xScalePadding: 0.1,
        solidOpacity: 1,
        transparentOpacity: 1,
        margins: margins.margins,
        legendYPostion: 0,
        fontSize: "10px",
        xAxisSettings: xAxisSettings
    };

    const zoomingSettings: ZoomingSettings = {
        enableZoom: <boolean>getValue(objects, Settings.zoomingSettings, ZoomingSettingsNames.show, true),
        maximumZoom: <number>getValue(objects, Settings.zoomingSettings, ZoomingSettingsNames.maximum, 10)
    }

    let viewModel: ViewModel = <ViewModel>{
        plotModels: new Array<PlotModel>(yCount),
        colorSettings: {
            colorSettings: {
                verticalRulerColor: getColorSettings(objects, ColorSettingsNames.verticalRulerColor, colorPalette, '#000000'),
                slabColor: getColorSettings(objects, ColorSettingsNames.slabColor, colorPalette, '#000000'),
                heatmapColorScheme: <string>getValue(objects, Settings.colorSettings, ColorSettingsNames.heatmapColorScheme, 'interpolateBlues')

            }
        },
        heatmapSettings: { heatmapBins: getValue<number>(objects, Settings.heatmapSettings, HeatmapSettingsNames.heatmapBins, 100) },
        tooltipModels: [],
        generalPlotSettings: generalPlotSettings,
        slabRectangles: [],
        svgHeight: svgHeight,
        svgTopPadding: margins.svgTopPadding,
        svgWidth: svgWidth,
        zoomingSettings: zoomingSettings,
        legend: legend,
        // defectIndices: defectIndices
    };
    return ok(viewModel);
}

function padTo2Digits(num) {
    return num.toString().padStart(2, '0');
}

function getAxisInformation(axisInformation: AxisInformation): Result<AxisInformationInterface, ParseAndTransformError> {
    switch (axisInformation) {
        case AxisInformation.None:
            return ok(<AxisInformationInterface>{
                lables: false,
                ticks: false
            });
        case AxisInformation.Ticks:
            return ok(<AxisInformationInterface>{
                lables: false,
                ticks: true
            });
        case AxisInformation.Labels:
            return ok(<AxisInformationInterface>{
                lables: true,
                ticks: false
            });
        case AxisInformation.TicksLabels:
            return ok(<AxisInformationInterface>{
                lables: true,
                ticks: true
            });
        default:
            return err(new GetAxisInformationError());
    }
    return err(new GetAxisInformationError());
}
