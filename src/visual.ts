/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
'use strict';

import 'core-js/stable';
import './../style/visual.less';
import 'regenerator-runtime/runtime';

import powerbi from 'powerbi-visuals-api';
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import DataView = powerbi.DataView;
import { scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import * as d3 from 'd3';
import { getPlotFillColor, getValue, getColorSettings, getCategoricalObjectValue, getCategoricalObjectColor } from './objectEnumerationUtility';
import { TooltipInterface, ViewModel, DataPoint, PlotModel, PlotType, SlabType, D3Plot, D3PlotXAxis, D3PlotYAxis, SlabRectangle, AxisInformation, TooltipModel, TooltipData, ZoomingSettings, GeneralPlotSettings, D3Heatmap, RolloutRectangle, LegendValue, Legend } from './plotInterface';
import { visualTransform } from './parseAndTransform';
import { OverlayPlotSettingsNames, ColorSettingsNames, Constants, AxisSettingsNames, PlotSettingsNames, Settings, PlotTitleSettingsNames, TooltipTitleSettingsNames, YRangeSettingsNames, ZoomingSettingsNames, LegendSettingsNames, AxisLabelSettingsNames, ArrayConstants, HeatmapSettingsNames } from './constants';
import { err, ok, Result } from 'neverthrow';
import { AddClipPathError, AddPlotTitlesError, AddVerticalRulerError, AddZoomError, BuildBasicPlotError, BuildXAxisError, BuildYAxisError, CustomTooltipError, DrawLinePlotError, DrawScatterPlotError, HeatmapError, PlotError, SlabInformationError } from './errors';
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { Heatmapmargins, MarginSettings } from './marginSettings';
import { line } from 'd3';

type Selection<T1, T2 = T1> = d3.Selection<any, T1, any, T2>;


export class Visual implements IVisual {
    private host: IVisualHost;
    private element: HTMLElement;
    private dataview: DataView;
    private viewModel: ViewModel;
    private svg: Selection<any>;
    private legendSelection = new Set(Object.keys(ArrayConstants.legendColors).concat(Object.keys(ArrayConstants.groupValues)));


    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.element = options.element;
        this.svg = d3.select(this.element).append('svg').classed('visualContainer', true)
            .attr("width", this.element.clientWidth)
            .attr("height", this.element.clientHeight);
    }


    private drawLegend(legend: Legend) {
        const unselectedOpacity = 0.3;
        const margins = this.viewModel.generalPlotSettings;
        const yPosition = margins.legendYPostion + 10;
        const legendData = legend.legendValues;
        const legendTitle = legend.legendTitle;
        const _this = this;
        let widths = [];
        let width = legend.legendXPosition;
        this.svg.selectAll("legendTitle")
            .data([legendTitle])
            .enter()
            .append("text")
            .text(d => d)
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle")
            .style("font-size", this.viewModel.generalPlotSettings.fontSize)
            .attr("x", function (d, i) {
                let x = width
                width = width + this.getComputedTextLength() + 15;
                return x;
            })
            .attr("y", yPosition)



        this.svg.selectAll("legendText")
            .data(legendData)
            .enter()
            .append("text")
            .text(function (d) { return String(d.value) })
            .attr("text-anchor", "left")
            .attr("class", d => Constants.defectLegendClass + " " + d.value)
            .style("alignment-baseline", "middle")
            .style("font-size", this.viewModel.generalPlotSettings.fontSize)
            .attr("x", function (d, i) {
                let x = width
                widths.push(width);
                width = width + 25 + this.getComputedTextLength();
                return 10 + x;
            })
            .attr("y", yPosition)
            .style("opacity", (d) => _this.legendSelection.has(d.value.toString()) ? 1 : unselectedOpacity)


        this.svg.selectAll("legendDots")
            .data(legendData)
            .enter()
            .append("circle")
            .attr("cx", function (d, i) { return widths[i] })
            .attr("cy", yPosition)
            .attr("r", 7)
            .style("fill", function (d) { return d.color })
            .style("stroke", "grey")
            .attr("class", d => Constants.defectLegendClass + " " + d.value)
            .style("opacity", (d) => _this.legendSelection.has(d.value.toString()) ? 1 : unselectedOpacity)
        this.svg.selectAll("." + Constants.defectLegendClass)
            .on("click", function (e: Event, d: LegendValue) {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                const def = d.value.toString();
                const selection = _this.svg.selectAll("." + Constants.defectLegendClass + "." + def);
                if (_this.legendSelection.has(def)) {
                    _this.legendSelection.delete(def);
                    selection.style("opacity", unselectedOpacity);
                } else {
                    _this.legendSelection.add(def);
                    selection.style("opacity", 1);
                }
                for (const plotModel of _this.viewModel.plotModels) {
                    if (plotModel.yName.includes("DEF")) {
                        _this.svg.selectAll("." + plotModel.plotSettings.plotSettings.plotType + plotModel.plotId).remove();
                        _this.drawPlot(plotModel);
                    }
                }
            })

        legend.legendXEndPosition = width;
        console.log(legend.legendTitle + " " + width)
    }

    public update(options: VisualUpdateOptions) {
        try {
            this.dataview = options.dataViews[0];
            let categoryIndices = new Set()
            if (this.dataview.categorical.categories) {
                this.dataview.categorical.categories = this.dataview.categorical.categories.filter(cat => {
                    const duplicate = categoryIndices.has(cat.source.index);
                    categoryIndices.add(cat.source.index);
                    return !duplicate;
                });
            }
            if (this.dataview.categorical.values) {
                let valueIndices = new Set()
                this.dataview.categorical.values = <powerbi.DataViewValueColumns>this.dataview.categorical.values.filter(val => {
                    const duplicate = valueIndices.has(val.source.index);
                    valueIndices.add(val.source.index);
                    return !duplicate;
                });
            }
            visualTransform(options, this.host).map(model => {
                this.viewModel = model
                this.svg.selectAll('*').remove();
                this.svg.attr("width", this.viewModel.svgWidth)
                    .attr("height", this.viewModel.svgHeight);
                this.drawPlots();
                if (this.viewModel.errorLegend != null) {
                    this.drawLegend(this.viewModel.errorLegend);
                    if (this.viewModel.controlLegend != null) { this.viewModel.controlLegend.legendXPosition = this.viewModel.errorLegend.legendXEndPosition + MarginSettings.legendSeparationMargin }
                }
                if (this.viewModel.controlLegend != null) {
                    this.drawLegend(this.viewModel.controlLegend);
                }
                if (this.viewModel.rolloutRectangles) {
                    this.drawRolloutRectangles();
                    this.drawRolloutLegend();
                }

            }).mapErr(err => this.displayError(err));

        } catch (error) {
            //try catch can be removed in the end, should not display any errors
            console.log(error);
        }
    }

    public displayError(error: Error) {
        this.svg.selectAll('*').remove();
        this.svg
            .append("text")
            .attr("width", this.element.clientWidth)
            .attr("x", 0)
            .attr("y", 20)
            .text("ERROR: " + error.name);
        this.svg
            .append("foreignObject")
            .attr("width", this.element.clientWidth)
            .attr("height", this.element.clientHeight - 40)
            .attr("x", 0)
            .attr("y", 30)
            .html("<p style='font-size:12px;'>" + error.message + "</p>");

        console.log("error: ", error.name);
        console.log(error.message);
        if (error.stack) {
            console.log(error.stack);
        }
    }

    private drawPlots() {
        this.addClipPath().mapErr(err => this.displayError(err));
        for (let plotModel of this.viewModel.plotModels) {
            this.drawPlot(plotModel)
                .mapErr(err => this.displayError(err));
        }
        const zoomingSettings = this.viewModel.zoomingSettings;
        if (zoomingSettings.enableZoom) {
            this.addZoom(zoomingSettings).mapErr(err => this.displayError(err));
        }
    }

    private drawRolloutLegend() {
        const margins = this.viewModel.generalPlotSettings;
        const yPosition = margins.legendYPostion + 10;
        const rolloutRectangles = this.viewModel.rolloutRectangles;
        let width = this.viewModel.errorLegend ? this.viewModel.errorLegend.legendXEndPosition + MarginSettings.legendSeparationMargin : margins.margins.left;
        if (this.viewModel.controlLegend) {
            width = this.viewModel.controlLegend.legendXEndPosition + MarginSettings.legendSeparationMargin;
        }
        let widths = [];

        this.svg.selectAll("rolloutLegendTitle")
            .data([rolloutRectangles.name])
            .enter()
            .append("text")
            .text(d => d)
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle")
            .style("font-size", this.viewModel.generalPlotSettings.fontSize)
            .attr("x", function (d, i) {
                let x = width;
                width = width + this.getComputedTextLength() + 15;
                return x;
            })
            .attr("y", yPosition);

        this.svg.selectAll("rolloutLegendText")
            .data(ArrayConstants.rolloutNames)
            .enter()
            .append("text")
            .text(d => d)
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle")
            .style("font-size", this.viewModel.generalPlotSettings.fontSize)
            .attr("x", function (d, i) {
                let x = width;
                widths.push(width);
                width = width + 25 + this.getComputedTextLength();
                return 10 + x;
            })
            .attr("y", yPosition);


        this.svg.selectAll("rolloutLegendDots")
            .data(ArrayConstants.rolloutColors)
            .enter()
            .append("circle")
            .attr("cx", function (d, i) { return widths[i]; })
            .attr("cy", yPosition)
            .attr("r", 7)
            .style("fill", d => d)
            .style("stroke", "grey")
            .style("opacity", rolloutRectangles.opacity * 2);
    }

    private drawRolloutRectangles() {
        const xScale = this.viewModel.generalPlotSettings.xAxisSettings.xScale;

        const rolloutG = this.svg
            .append("g")
            .attr("transform", 'translate(' + this.viewModel.generalPlotSettings.margins.left + ',' + 0 + ')');

        rolloutG.selectAll("." + Constants.rolloutClass)
            .data(this.viewModel.rolloutRectangles.rolloutRectangles)
            .enter()
            .append("rect")
            .attr("class", Constants.rolloutClass)
            .attr("width", (d) => xScale(d.length + d.x) - xScale(d.x))
            .attr("height", (d) => d.width)
            .attr("x", d => xScale(d.x))
            .attr("y", d => d.y)
            .attr("fill", d => d.color)
            .attr("clip-path", "url(#rolloutClip)")
            .style("opacity", this.viewModel.rolloutRectangles.opacity);
        rolloutG.lower();
    }

    private constructBasicPlot(plotModel: PlotModel): Result<void, PlotError> {
        const plotType = plotModel.plotSettings.plotSettings.plotType
        let root: d3.Selection<SVGGElement, any, any, any>;
        let x: D3PlotXAxis;
        let y: D3PlotYAxis;
        let plotError: PlotError;
        const PlotResult = this.buildBasicPlot(plotModel).map(plt => {
            root = plt;
            root.append("g").attr("class", Constants.slabClass).attr('clip-path', 'url(#slabClip)');
        }).mapErr(error => this.displayError(error));
        if (PlotResult.isErr()) {
            return err(plotError);
        }

        this.buildXAxis(plotModel, root).map(axis => x = axis).mapErr(err => plotError = err);
        this.buildYAxis(plotModel, root).map(axis => y = axis).mapErr(err => plotError = err);
        plotModel.d3Plot = <D3Plot>{ yName: plotModel.yName, type: plotType, root, points: null, x, y };
        this.addPlotTitles(plotModel, root).mapErr(err => plotError = err);
        this.addVerticalRuler(root).mapErr(err => plotError = err);
        this.drawSlabs(plotModel).mapErr(err => plotError = err);
        if (plotError) {
            return err(plotError);
        }

        return ok(null);

    }

    private addClipPath(): Result<void, PlotError> {
        try {

            const generalPlotSettings = this.viewModel.generalPlotSettings;
            const plotWidth = generalPlotSettings.plotWidth;
            const plotHeight = generalPlotSettings.plotHeight;
            this.svg.append('defs').append('clipPath')
                .attr('id', 'clip')
                .append('rect')
                .attr('y', -generalPlotSettings.dotMargin)
                .attr('x', -generalPlotSettings.dotMargin)
                .attr('width', plotWidth + 2 * generalPlotSettings.dotMargin)
                .attr('height', plotHeight + 2 * generalPlotSettings.dotMargin);
            this.svg.append('defs').append('clipPath')
                .attr('id', 'slabClip')
                .append('rect')
                .attr('y', 0)
                .attr('x', 0)
                .attr('width', plotWidth)
                .attr('height', plotHeight);
            this.svg.append('defs').append('clipPath')
                .attr('id', 'hclip')
                .append('rect')
                .attr('y', 0)
                .attr('x', 0)
                .attr('width', plotWidth)
                .attr('height', Heatmapmargins.heatmapHeight);
            if (this.viewModel.rolloutRectangles) {
                const rolloutRectangle = this.viewModel.rolloutRectangles.rolloutRectangles[0];
                const xScale = this.viewModel.generalPlotSettings.xAxisSettings.xScaleZoomed;
                this.svg.append('defs').append('clipPath')
                    .attr('id', 'rolloutClip')
                    .append('rect')
                    .attr('y', rolloutRectangle.y)
                    .attr('x', xScale(rolloutRectangle.x))
                    .attr('width', plotWidth)
                    .attr('height', rolloutRectangle.width);
            }
            return ok(null);
        } catch (error) {
            return err(new AddClipPathError(error.stack))
        }
    }

    private addPlotTitles(plotModel: PlotModel, plot: d3.Selection<SVGGElement, any, any, any>) {
        try {
            const generalPlotSettings = this.viewModel.generalPlotSettings;
            if (plotModel.plotTitleSettings.title.length > 0) {
                plot
                    .append('text')
                    .attr('class', 'plotTitle')
                    .attr('text-anchor', 'left')
                    .attr('y', 0 - generalPlotSettings.plotTitleHeight - generalPlotSettings.margins.top)
                    .attr('x', 0)
                    .attr('dy', '1em')
                    .style("font-size", generalPlotSettings.fontSize)
                    .text(plotModel.plotTitleSettings.title);
            }
            return ok(null);
        } catch (error) {
            return err(new AddPlotTitlesError(error.stack))
        }
    }

    private buildBasicPlot(plotModel: PlotModel): Result<d3.Selection<SVGGElement, any, any, any>, PlotError> {
        try {
            const plotType = plotModel.plotSettings.plotSettings.plotType;
            const generalPlotSettings = this.viewModel.generalPlotSettings;
            const plot = this.svg.append('g')
                .classed(plotType + plotModel.plotId, true)
                .attr('width', generalPlotSettings.plotWidth)
                .attr('height', generalPlotSettings.plotHeight)
                .attr('transform', 'translate(' + generalPlotSettings.margins.left + ',' + plotModel.plotTop + ')');
            return ok(plot);
        } catch (error) {
            return err(new BuildBasicPlotError(error.stack))
        }

    }

    private buildXAxis(plotModel: PlotModel, plot: any): Result<D3PlotXAxis, PlotError> {

        try {
            const generalPlotSettings = this.viewModel.generalPlotSettings;
            const xAxis = plot.append('g').classed('xAxis', true);

            const xAxisValue = axisBottom(generalPlotSettings.xAxisSettings.xScaleZoomed);
            let xLabel = null;
            if (!plotModel.formatSettings.axisSettings.xAxis.ticks) {
                xAxisValue.tickValues([]);
            }


            if (plotModel.formatSettings.axisSettings.xAxis.lables) {
                xLabel = plot
                    .append('text')
                    .attr('class', 'xLabel')
                    .attr('text-anchor', 'end')
                    .attr('x', generalPlotSettings.plotWidth / 2)
                    .attr('y', generalPlotSettings.plotHeight + (plotModel.formatSettings.axisSettings.xAxis.ticks ? 28 : 15))
                    .style("font-size", generalPlotSettings.fontSize)
                    .text(plotModel.labelNames.xLabel);
            }

            xAxis
                .attr('transform', 'translate(0, ' + generalPlotSettings.plotHeight + ')')
                .call(xAxisValue);

            return ok(<D3PlotXAxis>{ xAxis, xAxisValue, xLabel: xLabel });
        } catch (error) {
            return err(new BuildXAxisError(error.stack))
        }
    }

    private buildYAxis(plotModel: PlotModel, plot: any): Result<D3PlotYAxis, PlotError> {
        try {
            const generalPlotSettings = this.viewModel.generalPlotSettings;
            const yAxis = plot.append('g').classed('yAxis', true);
            const yScale = scaleLinear().domain([plotModel.yRange.min, plotModel.yRange.max]).range([generalPlotSettings.plotHeight, 0]);
            const yAxisValue = axisLeft(yScale).ticks(generalPlotSettings.plotHeight / 20);
            var yLabel = null;
            if (plotModel.formatSettings.axisSettings.yAxis.lables) {
                yLabel = plot
                    .append('text')
                    .attr('class', 'yLabel')
                    .attr('text-anchor', 'middle')
                    .attr('y', 0 - generalPlotSettings.margins.left)
                    .attr('x', 0 - generalPlotSettings.plotHeight / 2)
                    .attr('dy', '1em')
                    .style("font-size", generalPlotSettings.fontSize)
                    .attr('transform', 'rotate(-90)')
                    .text(plotModel.labelNames.yLabel);
            }

            if (!plotModel.formatSettings.axisSettings.yAxis.ticks) {
                yAxisValue.tickValues([]);
            }

            yAxis.call(yAxisValue);

            return ok(<D3PlotYAxis>{ yAxis, yAxisValue, yLabel, yScale, yScaleZoomed: yScale });
        } catch (error) {
            return err(new BuildYAxisError(error.stack))
        }


    }


    private drawSlabs(plotModel: PlotModel): Result<void, PlotError> {

        try {
            const colorSettings = this.viewModel.colorSettings.colorSettings;
            const slabtype = plotModel.overlayPlotSettings.overlayPlotSettings.slabType;
            const slabRectangles = this.viewModel.slabRectangles;
            const plotHeight = this.viewModel.generalPlotSettings.plotHeight;
            const plot = plotModel.d3Plot.root;
            const xScale = this.viewModel.generalPlotSettings.xAxisSettings.xScaleZoomed;
            const yScale = plotModel.d3Plot.y.yScale;
            if (slabtype != SlabType.None && slabRectangles != null) {
                if (slabRectangles.length == 0) {
                    return err(new SlabInformationError());
                }
                if (slabtype == SlabType.Rectangle) {
                    plot.select(`.${Constants.slabClass}`).selectAll('rect').data(slabRectangles).enter()
                        .append("rect")
                        .attr("x", function (d) { return xScale(d.x); })
                        .attr("y", function (d) { return yScale(d.width - d.y); })
                        .attr("width", function (d) { return xScale(d.length + d.x) - xScale(d.x); })
                        .attr("height", function (d) { return yScale(d.y) - yScale(d.width); })
                        .attr("fill", "transparent")
                        .attr("stroke", colorSettings.slabColor);
                } else if (slabtype == SlabType.Line) {
                    plot.select(`.${Constants.slabClass}`).selectAll('line').data(slabRectangles).enter()
                        .append("line")
                        .attr("stroke", colorSettings.slabColor)
                        .attr("x1", function (d) { return xScale(d.x); })
                        .attr("x2", function (d) { return xScale(d.x); })
                        .attr("y1", 0)
                        .attr("y2", plotHeight)
                        .style("opacity", 1);
                }
            } else {
                plot.select(`.${Constants.slabClass}`).remove()
            }
            return ok(null);
        } catch (error) {
            return err(new BuildYAxisError(error.stack))
        }
    }

    private addVerticalRuler(plot: any) {
        try {
            const verticalRulerSettings = this.viewModel.colorSettings.colorSettings.verticalRulerColor;
            const lineGroup = plot.append("g").attr("class", Constants.verticalRulerClass);
            let generalPlotSettings = this.viewModel.generalPlotSettings;

            lineGroup.append("line")
                .attr("stroke", verticalRulerSettings)
                .attr("x1", 10).attr("x2", 10)
                .attr("y1", 0).attr("y2", generalPlotSettings.plotHeight)
                .style("opacity", 0);
            return ok(null);
        } catch (error) {
            return err(new AddVerticalRulerError(error.stack))
        }
    }

    // private drawScatterPlot(plotModel: PlotModel): Result<D3Plot, PlotError> {
    //     try {
    //         let basicPlot: D3Plot;
    //         let plotError: PlotError;
    //         let x: D3PlotXAxis;
    //         let y: D3PlotYAxis;
    //         let type: PlotType;
    //         let plot: any;
    //         this.constructBasicPlot(plotModel)
    //             .map(plt => {
    //                 basicPlot = plt;
    //                 x = basicPlot.x;
    //                 y = basicPlot.y;
    //                 type = plotModel.plotSettings.plotSettings.plotType;
    //                 plot = basicPlot.root;
    //             }).mapErr(err => plotError = err);
    //         if (plotError) return err(plotError);
    //         const dataPoints = filterNullValues(plotModel.dataPoints);
    //         const points = plot
    //             .selectAll(Constants.dotClass)
    //             .data(dataPoints)
    //             .enter()
    //             .append('circle')
    //             .attr('fill', (d: DataPoint) => d.color)
    //             .attr('stroke', 'none')
    //             .attr('cx', (d) => x.xScale(<number>d.xValue))
    //             .attr('cy', (d) => y.yScale(<number>d.yValue))
    //             .attr('r', 2)
    //             .attr('clip-path', 'url(#clip)')
    //             .attr("transform", d3.zoomIdentity.translate(0, 0).scale(1));

    //         let mouseEvents: TooltipInterface;
    //         this.addTooltips().map(events => mouseEvents = events).mapErr(err => plotError = err);
    //         if (plotError) return err(plotError);
    //         points.on('mouseover', mouseEvents.mouseover).on('mousemove', mouseEvents.mousemove).on('mouseout', mouseEvents.mouseout);
    //         let heatmap = null;
    //         if (plotModel.plotSettings.plotSettings.showHeatmap) {
    //             this.drawHeatmap(dataPoints, plotModel).map(x => heatmap = x).mapErr(err => plotError = err);
    //             if (plotError) return err(plotError);
    //         }

    //         return ok(<D3Plot>{ yName: plotModel.yName, type, plotLine, plot, root: plot, points, x, y, heatmap });

    //     } catch (error) {
    //         return err(new DrawScatterPlotError(error.stack));
    //     }
    // }


    private drawPlot(plotModel: PlotModel): Result<void, PlotError> {
        try {

            let dotSize = 2;
            let plotError: PlotError;
            const xScale = this.viewModel.generalPlotSettings.xAxisSettings.xScaleZoomed;
            this.constructBasicPlot(plotModel)
                .mapErr(err => plotError = err);
            if (plotError) return err(plotError);
            const d3Plot = plotModel.d3Plot;
            const yScale = d3Plot.y.yScaleZoomed;
            let dataPoints = plotModel.dataPoints;
            dataPoints = filterNullValues(dataPoints);

            if (plotModel.yName.includes("DEF")) {
                dataPoints = dataPoints.filter(x => {
                    const def = this.viewModel.errorLegend.legendDataPoints.find(ldp => ldp.xValue === x.xValue)?.yValue.toString();
                    const grp = this.viewModel.controlLegend.legendDataPoints.find(ldp => ldp.xValue === x.xValue)?.yValue.toString();
                    return this.legendSelection.has(def) && this.legendSelection.has(grp);
                });
                dotSize = 3;
            }

            const plotType = plotModel.plotSettings.plotSettings.plotType;

            if (plotType == PlotType.LinePlot) {
                const line = d3
                    .line<DataPoint>()
                    .x((d) => xScale(<number>d.xValue))
                    .y((d) => yScale(<number>d.yValue));
                d3Plot.plotLine = d3Plot.root
                    .append('path')
                    .datum(dataPoints)
                    .attr("class", "path")
                    .attr('d', line)
                    .attr('fill', 'none')
                    .attr('stroke', plotModel.plotSettings.plotSettings.fill)
                    .attr('stroke-width', 1.5)
                    .attr('clip-path', 'url(#clip)');
            }

            d3Plot.points = d3Plot.root
                .selectAll(Constants.dotClass)
                .data(dataPoints)
                .enter()
                .append('circle')
                .attr('fill', (d: DataPoint) => d.color)//plotModel.plotSettings.plotSettings.fill)
                .attr('stroke', 'none')
                .attr('cx', (d) => xScale(<number>d.xValue))
                .attr('cy', (d) => yScale(<number>d.yValue))
                .attr('r', dotSize)
                .attr('clip-path', 'url(#clip)');

            let mouseEvents: TooltipInterface;
            this.addTooltips().map(events => mouseEvents = events).mapErr(err => plotError = err);
            if (plotError) return err(plotError);
            d3Plot.points.on('mouseover', mouseEvents.mouseover).on('mousemove', mouseEvents.mousemove).on('mouseout', mouseEvents.mouseout);
            if (plotModel.plotSettings.plotSettings.showHeatmap) {
                this.drawHeatmap(dataPoints, plotModel).map(x => plotModel.d3Plot.heatmap = x).mapErr(err => plotError = err);
                if (plotError) return err(plotError);
            }

            return ok(null);
        } catch (error) {
            return err(new DrawLinePlotError(error.stack));
        }
    }

    private drawHeatmap(dataPoints: DataPoint[], plotModel: PlotModel): Result<D3Heatmap, HeatmapError> {
        try {


            const generalPlotSettings = this.viewModel.generalPlotSettings;
            const heatmapSettings = this.viewModel.heatmapSettings;
            const xAxisSettings = plotModel.formatSettings.axisSettings.xAxis;
            const bins = d3.bin<DataPoint, number>().value((d: DataPoint) => { return <number>d.xValue; }).thresholds(heatmapSettings.heatmapBins);
            const binnedData = bins(dataPoints);
            const heatmapValues = binnedData.map(bin => {
                var extent = d3.extent(bin.map(d => <number>d.yValue));
                return extent[1] - extent[0];
            });
            const colorScale = d3.scaleSequential()
                .interpolator(d3[this.viewModel.colorSettings.colorSettings.heatmapColorScheme])
                .domain(d3.extent(heatmapValues));
            const heatmapScale = d3.scaleLinear()
                .domain([0, heatmapValues.length])
                .range([0, this.viewModel.generalPlotSettings.plotWidth]);


            let yTransition = generalPlotSettings.plotHeight + generalPlotSettings.margins.bottom;
            yTransition += xAxisSettings.lables || xAxisSettings.ticks ? Heatmapmargins.heatmapMargin : 0;
            yTransition += xAxisSettings.lables && xAxisSettings.ticks ? MarginSettings.xLabelSpace : 0;
            const heatmap = this.svg.append('g')
                .classed("Heatmap" + plotModel.plotId, true)
                .attr('width', generalPlotSettings.plotWidth)
                .attr('height', generalPlotSettings.plotHeight)
                .attr('transform', 'translate(' + generalPlotSettings.margins.left + ',' + (plotModel.plotTop + yTransition) + ')');
            heatmap.append("rect")
                .attr("width", generalPlotSettings.plotWidth)
                .attr("height", Heatmapmargins.heatmapHeight)
                .attr("fill", "transparent")
                .attr("stroke", "#000000");
            let values = heatmap.selectAll()
                .data(heatmapValues)
                .enter()
                .append("rect")
                .attr("x",
                    function (d, i) { return heatmapScale(i); })
                .attr("y", 0)
                .attr("width", function (d, i) { return heatmapScale(i) - heatmapScale(i - 1); })
                .attr("height", Heatmapmargins.heatmapHeight)
                .attr("fill", function (d) {
                    return colorScale(d);
                });

            this.drawHeatmapLegend(yTransition, colorScale, heatmap, generalPlotSettings);
            let d3heatmap: D3Heatmap = {
                axis: null,
                scale: heatmapScale,
                values: values
            }
            return ok(d3heatmap);

        } catch (error) {
            return err(new HeatmapError(error.stack))
        }
    }

    private drawHeatmapLegend(yTransition: number, colorScale: d3.ScaleSequential<number, never>, heatmap: d3.Selection<SVGGElement, any, any, any>, generalPlotSettings: GeneralPlotSettings) {
        const legendHeight = yTransition + Heatmapmargins.heatmapHeight;
        let legendScale = Object.assign(colorScale.copy()
            .interpolator(d3.interpolateRound(0, legendHeight)),
            { range() { return [0, legendHeight]; } });

        let tickValues = d3.range(Heatmapmargins.legendTickCount).map(i => d3.quantile(colorScale.domain(), i / (Heatmapmargins.legendTickCount - 1)));
        let legend = heatmap.append("g")
            .attr("transform", `translate(${generalPlotSettings.plotWidth + Heatmapmargins.legendMargin},${-yTransition})`);
        legend.append("image")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", Heatmapmargins.legendWidth)
            .attr("height", legendHeight)
            .attr("preserveAspectRatio", "none")
            .attr("xlink:href", createHeatmapLegendImage(colorScale.interpolator()).toDataURL());
        let tickAdjust = g => g.selectAll(".tick line").attr("x1", Heatmapmargins.legendWidth - Heatmapmargins.legendTicksTranslation).attr("x2", -Heatmapmargins.legendTicksTranslation);
        legend.append("g")
            .attr("transform", `translate(${Heatmapmargins.legendTicksTranslation},0)`)
            .call(d3.axisRight(legendScale)
                .tickSize(6)
                .tickValues(tickValues))
            .call(tickAdjust)
            .call(g => g.select(".domain").remove());

        function createHeatmapLegendImage(color, n = 256) {
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = n;
            const context = canvas.getContext("2d");
            for (let i = 0; i < n; ++i) {
                context.fillStyle = color(i / (n - 1));
                context.fillRect(0, i, 1, 1);
            }
            return canvas;
        }
    }

    private addZoom(zoomingSettings: ZoomingSettings): Result<void, PlotError> {
        try {
            const _this = this;
            const generalPlotSettings = this.viewModel.generalPlotSettings;
            const plots = this.viewModel.plotModels;
            let errorFunction = this.displayError;
            let zoomed = function (event) {
                try {
                    let transform: d3.ZoomTransform = event.transform;
                    if (transform.k == 1 && (transform.x !== 0 || transform.y !== 0)) {
                        _this.svg
                            .call(zoom.transform, d3.zoomIdentity);
                        return;
                    }

                    const xScaleZoomed = transform.rescaleX(generalPlotSettings.xAxisSettings.xScale);
                    const xMin = xScaleZoomed.domain()[0];
                    const xMax = xScaleZoomed.domain()[1];
                    _this.viewModel.generalPlotSettings.xAxisSettings.xScaleZoomed = xScaleZoomed;
                    _this.svg.selectAll("." + Constants.rolloutClass)
                        .attr("x", function (d: RolloutRectangle) { return xScaleZoomed(d.x); })
                        .attr("width", function (d: RolloutRectangle) { return xScaleZoomed(d.length + d.x) - xScaleZoomed(d.x); });
                    for (let plot of plots.map(x => x.d3Plot)) {
                        plot.x.xAxis.attr('clip-path', 'url(#clip)');
                        let xAxisValue = plot.x.xAxisValue;
                        xAxisValue.scale(xScaleZoomed);
                        plot.x.xAxis.call(xAxisValue);
                        plot.points.attr('cx', (d) => { return xScaleZoomed(<number>d.xValue) })

                        // //y-zoom for 212
                        // if (plot.yName.includes("212")) {
                        //     const yScale = plot.y.yScale;
                        //     let domain = yScale.domain();
                        //     const invertScale = yScale.domain([domain[1], domain[0]]);
                        //     const t = d3.zoomIdentity.translate(0, 0).scale(transform.k);
                        //     let yScaleNew = t.rescaleY(invertScale);
                        //     yScale.domain(domain);
                        //     domain = yScaleNew.domain();
                        //     yScaleNew = yScaleNew.domain([domain[1], domain[0]]);
                        //     const plotModel = _this.viewModel.plotModels.filter(x => x.yName === plot.yName)[0];
                        //     const yDataPoints = plotModel.dataPoints.filter(x => x.xValue >= xMin && x.xValue <= xMax).map(x => Number(x.yValue));
                        //     const yMin = Math.min(yScaleNew.domain()[0], ...yDataPoints);
                        //     const yMax = Math.max(yScaleNew.domain()[1], ...yDataPoints);
                        //     yScaleNew.domain([yMin, yMax]);
                        //     plot.y.yScaleZoomed = yScaleNew;
                        //     plot.points.attr('cy', (d) => { return yScaleNew(<number>d.yValue) })
                        //         .attr('r', 2);
                        //     let yAxisValue = plot.y.yAxisValue;
                        //     yAxisValue.scale(yScaleNew);
                        //     plot.y.yAxis.call(yAxisValue);
                        // } 
                        // else {
                        const plotModel = _this.viewModel.plotModels.filter(x => x.yName === plot.yName)[0];
                        const yDataPoints = plotModel.dataPoints.filter(x => x.xValue >= xMin && x.xValue <= xMax).map(x => Number(x.yValue));
                        const yMin = plotModel.yRange.minFixed ? plotModel.yRange.min : Math.min(...yDataPoints);
                        const yMax = plotModel.yRange.maxFixed ? plotModel.yRange.max : Math.max(...yDataPoints);
                        plot.y.yScaleZoomed = plot.y.yScaleZoomed.domain([yMin, yMax]);
                        plot.points.attr('cy', (d) => { return plot.y.yScaleZoomed(<number>d.yValue) })
                        let yAxisValue = plot.y.yAxisValue;
                        yAxisValue.scale(plot.y.yScaleZoomed);
                        plot.y.yAxis.call(yAxisValue);
                        // }

                        plot.points.attr('clip-path', 'url(#clip)');
                        var slabBars = plot.root.select(`.${Constants.slabClass}`);
                        slabBars.selectAll('rect')
                            .attr("x", function (d: SlabRectangle) { return xScaleZoomed(d.x); })
                            .attr("width", function (d: SlabRectangle) { return xScaleZoomed(d.length + d.x) - xScaleZoomed(d.x); });
                        slabBars.selectAll('line')
                            .attr("x1", function (d: SlabRectangle) { return xScaleZoomed(d.x); })
                            .attr("x2", function (d: SlabRectangle) { return xScaleZoomed(d.x); })

                        if (plot.type === 'LinePlot') {
                            plot.plotLine.attr('clip-path', 'url(#clip)');

                            let line = d3
                                .line<DataPoint>()
                                .x((d) => xScaleZoomed(<number>d.xValue))
                                .y((d) => plot.y.yScaleZoomed(<number>d.yValue));

                            plot.plotLine.attr('d', line);
                        }
                        if (plot.heatmap) {
                            let values = plot.heatmap.values;
                            let scale = transform.rescaleX(plot.heatmap.scale);
                            values.attr("x", function (d, i) { return scale(i); })
                                .attr("width", function (d, i) { return scale(i) - scale(i - 1); })
                                .attr('clip-path', 'url(#hclip)')
                        }
                    }
                } catch (error) {
                    error.message = "error in zoom function: " + error.message;
                    errorFunction(error);
                }
            }

            let zoom = d3.zoom().scaleExtent([1, zoomingSettings.maximumZoom]).on('zoom', zoomed); // with scale extent you can control how much you scale

            this.svg.call(zoom);
            return ok(null);
        } catch (error) {
            return err(new AddZoomError(error.stack));
        }

    }

    private addTooltips(): Result<TooltipInterface, PlotError> {
        try {

            const tooltipOffset = 10;
            const viewModel = this.viewModel;
            const visualContainer = this.svg.node();
            const margins = this.viewModel.generalPlotSettings.margins;
            const tooltipModels = this.viewModel.tooltipModels;
            const errorFunction = this.displayError;
            var lines = d3.selectAll(`.${Constants.verticalRulerClass} line`);
            var tooltip = d3.select(this.element)
                .append('div')
                .style("position", "absolute")
                .style("visibility", "hidden")
                .style("background-color", "#484848")
                .style("border", "solid")
                .style("border-width", "1px")
                .style("border-radius", "5px")
                .style("padding", "10px")
                .html("No tooltip info available");

            let mouseover = function () {
                try {
                    lines = d3.selectAll(`.${Constants.verticalRulerClass} line`);
                    tooltip.style("visibility", "visible");
                    const element = d3.select(this);
                    element
                        .attr('r', Number(element.attr('r')) * 2)
                        .style("stroke", "black")
                        .style("opacity", 1);
                    lines.style("opacity", 1);
                } catch (error) {
                    error.message = "error in tooltip mouseover: " + error.message;
                    errorFunction(error);
                }
            };

            let mousemove = function (event, data) {
                try {
                    const height = visualContainer.clientHeight;
                    const width = visualContainer.clientWidth;
                    const x = event.clientX - margins.left;
                    const tooltipX = event.clientX > width / 2 ? event.clientX - tooltip.node().offsetWidth - tooltipOffset : event.clientX + tooltipOffset;
                    let tooltipY = event.clientY > height / 2 ? event.clientY - tooltip.node().offsetHeight - tooltipOffset : event.clientY + tooltipOffset;


                    let tooltipData: TooltipData[] = [];


                    //add tooltips
                    tooltipModels.filter((model: TooltipModel) => {
                        model.tooltipData.filter(modelData => {
                            if (modelData.xValue == data.xValue) {
                                tooltipData.push({
                                    yValue: modelData.yValue === null ? '-' : modelData.yValue,
                                    title: model.tooltipName
                                });
                            }
                        })
                    });
                    let tooltipSet = new Set(tooltipData.map(tooltip => "<b> " + tooltip.title + "</b> : " + tooltip.yValue + " <br> "))


                    tooltip
                        .html(Array.from(tooltipSet).join(''))
                    const tooltipHeight = tooltip.node().getBoundingClientRect().height;
                    tooltipY = Math.max(tooltipY, 0);
                    tooltipY = Math.min(tooltipY, viewModel.svgHeight - tooltipHeight);
                    tooltip
                        .style("left", (tooltipX) + "px")
                        .style("top", (tooltipY) + "px")
                        .style("color", "#F0F0F0");

                    lines.attr("x1", x).attr("x2", x);

                } catch (error) {
                    error.message = "error in tooltip mousemove: " + error.message;
                    errorFunction(error);
                }
            };

            let mouseout = function () {
                try {
                    tooltip.style("visibility", "hidden");
                    const element = d3.select(this);
                    element
                        .attr('r', Number(element.attr('r')) / 2)
                        .style("stroke", "none")
                        .style("opacity", 0.8);
                    lines.style("opacity", 0);

                } catch (error) {
                    error.message = "error in tooltip mouseout: " + error.message;
                    errorFunction(error);
                }
            }
            return ok(<TooltipInterface>{ mouseover, mousemove, mouseout });
        } catch (error) {
            return err(new CustomTooltipError(error.stack));
        }
    }



    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        const objectName = options.objectName;
        const colorPalette = this.host.colorPalette;
        const objects = this.dataview.metadata.objects;
        let objectEnumeration: VisualObjectInstance[] = [];
        const zoomingSettings = this.viewModel.zoomingSettings;
        const plotmodles: PlotModel[] = this.viewModel.plotModels;
        try {
            let yCount: number = this.dataview.metadata.columns.filter(x => { return x.roles.y_axis }).length;
            let metadataColumns: DataViewMetadataColumn[] = this.dataview.metadata.columns;
            switch (objectName) {
                case Settings.plotSettings:
                    setObjectEnumerationColumnSettings(yCount, metadataColumns, 4);
                    break;
                case Settings.axisLabelSettings:
                case Settings.axisSettings:
                    setObjectEnumerationColumnSettings(yCount, metadataColumns, 2);
                    break;
                case Settings.yRangeSettings:
                    setObjectEnumerationColumnSettings(yCount, metadataColumns, 4);
                    break;
                case Settings.overlayPlotSettings:
                case Settings.plotTitleSettings:
                    setObjectEnumerationColumnSettings(yCount, metadataColumns);
                    break;
                case Settings.colorSelector:
                    break;
                case Settings.tooltipTitleSettings:
                    const tooltipModels = this.viewModel.tooltipModels;
                    const tooltipCount = tooltipModels.length;
                    objectEnumeration = new Array<VisualObjectInstance>(tooltipCount);
                    for (const column of metadataColumns) {
                        if (column.roles.tooltip) {
                            const yIndex: number = column['rolesIndex']['tooltip'][0];
                            objectEnumeration[yIndex] = {
                                objectName: objectName,
                                displayName: column.displayName,
                                properties: { title: getValue<string>(column.objects, Settings.tooltipTitleSettings, TooltipTitleSettingsNames.title, column.displayName) },
                                selector: { metadata: column.queryName }
                            };
                        }
                    }
                    break;
                case Settings.colorSettings:
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            verticalRulerColor: getColorSettings(objects, ColorSettingsNames.verticalRulerColor, colorPalette, '#000000'),
                            slabColor: getColorSettings(objects, ColorSettingsNames.slabColor, colorPalette, '#0000FF'),
                            heatmapColorScheme: <string>getValue(objects, Settings.colorSettings, ColorSettingsNames.heatmapColorScheme, 'interpolateBlues')
                        },
                        selector: null
                    });
                    break;

                case Settings.heatmapSettings:
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            heatmapBins: <number>getValue(objects, Settings.heatmapSettings, HeatmapSettingsNames.heatmapBins, 100)
                        },
                        selector: null
                    });
                    break;
                case Settings.legendSettings:
                    if (!this.viewModel.errorLegend) break;
                    let legendValues = this.viewModel.errorLegend.legendValues;
                    let categories = this.dataview.categorical.categories.filter(x => x.source.roles.legend)
                    let category = categories.length > 0 ? categories[0] : null;

                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            errorLegendTitle: <string>getValue(objects, Settings.legendSettings, LegendSettingsNames.errorLegendTitle, this.viewModel.errorLegend.legendTitle),
                            controlLegendTitle: <string>getValue(objects, Settings.legendSettings, LegendSettingsNames.controlLegendTitle, this.viewModel.controlLegend.legendTitle)
                        },
                        selector: null
                    });
                    let i = 0;
                    for (const value of legendValues) {
                        objectEnumeration.push({
                            objectName: objectName,
                            displayName: String(value.value),
                            properties: {
                                legendColor: getCategoricalObjectColor(category, i, Settings.legendSettings, LegendSettingsNames.legendColor, value.color),
                            },
                            altConstantValueSelector: value.selectionId.getSelector(),
                            selector: dataViewWildcard.createDataViewWildcardSelector(dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals)
                        });
                        i++;
                    }
                    break;
                case Settings.zoomingSettings:

                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            show: <boolean>getValue(objects, Settings.zoomingSettings, ZoomingSettingsNames.show, zoomingSettings.enableZoom),
                            maximum: <number>getValue(objects, Settings.zoomingSettings, ZoomingSettingsNames.maximum, zoomingSettings.maximumZoom)
                        },
                        selector: null
                    });
                    break;
            }
        } catch (error) {
            error.message = "error in enumerate objects: " + error.message;
            this.displayError(error);
        }
        return objectEnumeration;

        function setObjectEnumerationColumnSettings(yCount: number, metadataColumns: powerbi.DataViewMetadataColumn[], settingsCount: number = 1) {
            objectEnumeration = new Array<VisualObjectInstance>(yCount * settingsCount);

            for (let column of metadataColumns) {
                if (column.roles.y_axis) {
                    const columnObjects = column.objects;
                    var displayNames = {}
                    var properties = {}
                    //index that the column has in the plot (differs from index in metadata) and is used to have the same order in settings
                    const yIndex: number = column['rolesIndex']['y_axis'][0];
                    switch (objectName) {
                        case Settings.plotSettings:
                            displayNames = {
                                plotType: column.displayName + " Plot Type",
                                fill: column.displayName + " Plot Color",
                                useLegendColor: column.displayName + " Use Legend Color",
                                showHeatmap: column.displayName + " Show Heatmap"
                            };
                            properties = {
                                plotType: PlotType[getValue<string>(columnObjects, Settings.plotSettings, PlotSettingsNames.plotType, PlotType.LinePlot)],
                                fill: getPlotFillColor(columnObjects, colorPalette, '#000000'),
                                useLegendColor: getValue<boolean>(columnObjects, Settings.plotSettings, PlotSettingsNames.useLegendColor, false),
                                showHeatmap: <boolean>getValue(columnObjects, Settings.plotSettings, PlotSettingsNames.showHeatmap, false)

                            };

                            break;

                        case Settings.axisSettings:
                            const xInformation = AxisInformation[getValue<string>(columnObjects, Settings.axisSettings, AxisSettingsNames.xAxis, AxisInformation.None)]
                            const yInformation = AxisInformation[getValue<string>(columnObjects, Settings.axisSettings, AxisSettingsNames.yAxis, AxisInformation.Ticks)]

                            displayNames = {
                                xInformation: column.displayName + " X-Axis",
                                yInformation: column.displayName + " Y-Axis",
                            };
                            properties = {
                                xAxis: xInformation,
                                yAxis: yInformation
                            };
                            break;
                        case Settings.axisLabelSettings:
                            const labelNames = plotmodles.filter(x => { return x.plotId == yIndex })[0].labelNames;
                            const xLabel = getValue<string>(columnObjects, Settings.axisLabelSettings, AxisLabelSettingsNames.xLabel, labelNames.xLabel);
                            const yLabel = getValue<string>(columnObjects, Settings.axisLabelSettings, AxisLabelSettingsNames.yLabel, labelNames.yLabel);
                            displayNames = {
                                xLabel: column.displayName + " x-Label",
                                yLabel: column.displayName + " y-Label",
                            };
                            properties[AxisLabelSettingsNames.xLabel] = xLabel;
                            properties[AxisLabelSettingsNames.yLabel] = yLabel;
                            break;
                        case Settings.yRangeSettings:
                            const yRange = plotmodles.filter(x => { return x.plotId == yIndex })[0].yRange
                            displayNames = {
                                min: column.displayName + " Minimum Value",
                                max: column.displayName + " Maximum Value",
                                minFixed: column.displayName + " Fixed Minimum",
                                maxFixed: column.displayName + " Fixed Maximum",
                            };
                            properties = {
                                min: getValue<number>(columnObjects, Settings.yRangeSettings, YRangeSettingsNames.min, 0),
                                max: getValue<number>(columnObjects, Settings.yRangeSettings, YRangeSettingsNames.max, yRange.max),
                                minFixed: <boolean>getValue(columnObjects, Settings.yRangeSettings, YRangeSettingsNames.minFixed, true),
                                maxFixed: <boolean>getValue(columnObjects, Settings.yRangeSettings, YRangeSettingsNames.maxFixed, false)
                            };
                            break;
                        case Settings.overlayPlotSettings:
                            displayNames = {
                                overlayType: column.displayName + " Overlay Type"
                            };
                            properties = {
                                slabType: SlabType[getValue<string>(columnObjects, Settings.overlayPlotSettings, OverlayPlotSettingsNames.slabType, SlabType.None)]
                            };
                            break;
                        case Settings.plotTitleSettings:
                            displayNames = {
                                overlayType: column.displayName + " Plot Title"
                            };
                            properties = {
                                title: getValue<string>(columnObjects, Settings.plotTitleSettings, PlotTitleSettingsNames.title, column.displayName)
                            };
                            break;
                    }

                    const propertyEntries = Object.entries(properties);
                    const displayNamesEntries = Object.entries(displayNames);

                    for (let i = 0; i < propertyEntries.length; i++) {
                        const [key, value] = propertyEntries[i];
                        var props = {};
                        props[key] = value;
                        objectEnumeration[yIndex * settingsCount + i] = {
                            objectName: objectName,
                            displayName: <string>displayNamesEntries[i][1],
                            properties: props,
                            selector: { metadata: column.queryName },
                        };

                    }


                }
            }
            if (objectName === Settings.yRangeSettings) debugger;
        }
    }
}

//function to print color schemes for adding them to capabilities
function printColorSchemes() {
    var str = "";
    for (const scheme of ArrayConstants.colorSchemes.sequential) {
        str = str + '{"displayName": "' + scheme + '",   "value": "interpolate' + scheme + '"},';
    }
    console.log(str);
}

function filterNullValues(dataPoints: DataPoint[]) {
    dataPoints = dataPoints.filter(d => { return d.yValue != null; });
    return dataPoints;
}
