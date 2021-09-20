import powerbi from 'powerbi-visuals-api';
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import { interactivitySelectionService } from 'powerbi-visuals-utils-interactivityutils';
import SelectableDataPoint = interactivitySelectionService.SelectableDataPoint;
import ISelectionId = powerbi.visuals.ISelectionId;
import PrimitiveValue = powerbi.PrimitiveValue;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { getValue, getAxisTextFillColor, getColumnnColorByIndex } from "./objectEnumerationUtility";
export interface BarViewModel {
    dataPoints: BarDataPoint[];
    dataMax: number;
    settings: BarSettings;
    hasHighlights?: boolean;
}

export interface BarDataPoint extends SelectableDataPoint { //selection can be added here on demand
    value: PrimitiveValue;
    category: string;
    color?: string;
    highlight?: boolean;
    opacity?: number
}

export interface BarSettings {
    enableAxis: {
        show: boolean;
        fill: string;
    };
}

export interface Legend {
    text: string;
    transform?: string;
    dx?: string;
    dy?: string;
}


/**
 * Function that converts queried data into a viewmodel that will be used by the visual.
 *
 * @function
 * @param {VisualUpdateOptions} options - Contains references to the size of the container
 *                                        and the dataView which contains all the data
 *                                        the visual had queried.
 * @param {IVisualHost} host            - Contains references to the host which contains services
 */

export function visualTransform(options: VisualUpdateOptions, host: IVisualHost): BarViewModel {
    let dataViews = options.dataViews;
    let viewModel: BarViewModel = {
        dataPoints: [],
        dataMax: 0,
        settings: <BarSettings>{}
    };

    if(!dataViews
       || !dataViews[0]
       || !dataViews[0].categorical
       || !dataViews[0].categorical.categories
       || !dataViews[0].categorical.categories[0].source
       || !dataViews[0].categorical.values) {
        return viewModel;
    }
    let categorical = dataViews[0].categorical;
    let category = categorical.categories[0];
    let dataValue = categorical.values[0];

    let barDataPoints: BarDataPoint[] = [];
    let dataMax: number;

    let colorPalette: ISandboxExtendedColorPalette = host.colorPalette;
    let objects = dataViews[0].metadata.objects;

    let defaultSettings: BarSettings = {
        enableAxis: {
            show: true,
            fill: "#000000",
        }
    };

    let lineSettings: BarSettings = {
        enableAxis: {
            show: getValue<boolean>(objects, 'enableAxis', 'show', defaultSettings.enableAxis.show),
            fill: getAxisTextFillColor(objects, colorPalette, defaultSettings.enableAxis.fill)
        }
    };

    const maxLengthAttributes = Math.max(category.values.length, dataValue.values.length);

    let i = 0;

    while(i < maxLengthAttributes) {

        // you can also set the color of the attributes;
        const color: string = getColumnnColorByIndex(category, i, colorPalette);

        const selectionId: ISelectionId = host.createSelectionIdBuilder()
        .withCategory(category, i)
        .createSelectionId();

        let dataPoint: BarDataPoint = {
            value: dataValue.values[i],
            category: `${category.values[i]}`,
            color: color,
            identity: selectionId,
            selected: false };

        barDataPoints.push(dataPoint);

        i = i + 1;

        dataMax = <number>dataValue.maxLocal;
    }

    return {
        dataPoints: barDataPoints,
        dataMax: dataMax,
        settings: lineSettings
    };
}


