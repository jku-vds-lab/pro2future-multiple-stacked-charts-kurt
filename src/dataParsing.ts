import powerbi from 'powerbi-visuals-api';
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { getValue } from './objectEnumerationUtility';

export interface GeneralSettings {
    plotType: {
        plot: number;
        type: string;
    };
}

export interface GeneralViewModel {
    xValues: number[];
    yValues: number[];
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    settings: GeneralSettings;
}

// return data points of plots asked on demand

export function visualTransform(options: VisualUpdateOptions, type: string = 'line'): GeneralViewModel[] {
    let dataViews = options.dataViews;

    try {
        debugger;
        let viewModels: GeneralViewModel[] = [];
        let xDataPoints: number[] = [];
        let yDataPoints: number[] = [];

        if (!dataViews || !dataViews[0] || !dataViews[0].categorical || !dataViews[0].metadata) {
            return null;
        }

        let objects = dataViews[0].metadata.objects;

        let defaultSettings: GeneralSettings = {
            plotType: {
                plot: 1,
                type: 'line',
            },
        };

        let settings: GeneralSettings = {
            plotType: {
                plot: getValue<number>(objects, 'plotType', 'plot', defaultSettings.plotType.plot),
                type: getValue<string>(objects, 'plotType', 'type', defaultSettings.plotType.type),
            },
        };

        let categorical = dataViews[0].categorical;
        let plotNr: number = settings.plotType.plot;

        if (categorical.categories) {
            for (let category of categorical.categories) {
                if (Object.keys(category.source.roles)[0] == 'x_plot_' + plotNr) {
                    xDataPoints = <number[]>category.values;
                }
                if (Object.keys(category.source.roles)[0] == 'y_plot_' + plotNr) {
                    yDataPoints = <number[]>category.values;
                }

                if (xDataPoints.length > 0 && yDataPoints.length > 0) {
                    viewModels.push({
                        xValues: xDataPoints,
                        yValues: yDataPoints,
                        xMin: Math.min(...xDataPoints),
                        xMax: Math.max(...xDataPoints),
                        yMin: Math.min(...yDataPoints),
                        yMax: Math.max(...yDataPoints),
                        settings: {
                            plotType: {
                                plot: plotNr,
                                type: settings.plotType.type,
                            },
                        },
                    });

                    // Reset data points to empty for saving other plots
                    xDataPoints = [];
                    yDataPoints = [];
                }
            }
        }

        if (categorical.values) {
            for (let value of categorical.values) {
                if (Object.keys(value.source.roles)[0] == 'x_plot_' + plotNr) {
                    xDataPoints = <number[]>value.values;
                }
                if (Object.keys(value.source.roles)[0] == 'y_plot_' + plotNr) {
                    yDataPoints = <number[]>value.values;
                }

                if (xDataPoints.length && yDataPoints.length) {
                    viewModels.push({
                        xValues: xDataPoints,
                        yValues: yDataPoints,
                        xMin: Math.min(...xDataPoints),
                        xMax: Math.max(...xDataPoints),
                        yMin: Math.min(...yDataPoints),
                        yMax: Math.max(...yDataPoints),
                        settings: {
                            plotType: {
                                plot: plotNr,
                                type: settings.plotType.type,
                            },
                        },
                    });

                    // Reset data points to empty for saving other plots
                    xDataPoints = [];
                    yDataPoints = [];
                }
            }
        }

        return viewModels;
    } catch (error) {
        console.log('Error in main visual transform: ', error());
    }
}
