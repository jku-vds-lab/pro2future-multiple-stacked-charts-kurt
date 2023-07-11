import { Margins } from './plotInterface';

export class MarginSettings {
    static readonly svgTopPadding = 0;
    static readonly svgBottomPadding = 10;
    static readonly plotTitleHeight = 10;
    static readonly legendHeight = 20;
    static readonly legendSeparationMargin = 20;
    static readonly verticalLegendSeparationMargin = 5;
    static readonly legendTopMargin = 10;
    static readonly legendLeftIndent = 50;
    static readonly legendYSpacing = 15;
    static readonly legendXSpacing = 15;
    static readonly dotMargin = 4;
    static readonly xLabelSpace = 10;
    static readonly scrollbarSpace = 23;
    static readonly legendDotSize = 6;
    static readonly plotLegendSize = 30;
    static readonly heatmapLegendSize = 35;

    static readonly margins: Margins = {
        top: 10,
        right: 45,
        bottom: 10,
        left: 40,
    };
    static readonly miniumumPlotWidth = 120;
}

export class Heatmapmargins {
    static readonly heatmapHeight = 10;
    static readonly heatmapMargin = 6;
    static readonly heatmapSpace = this.heatmapMargin + this.heatmapHeight;
    static readonly legendWidth = 10;
    static readonly legendMargin = 20;
    static readonly legendTicksTranslation = 3;
    static readonly legendTickCount = 3;
}
