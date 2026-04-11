// Type declaration for plotly.js-dist-min
declare module 'plotly.js-dist-min' {
  interface PlotlyHTMLElement extends HTMLElement {
    data: object[];
    layout: object;
  }

  const Plotly: {
    newPlot(
      root: HTMLElement,
      data: object[],
      layout?: object,
      config?: object,
    ): Promise<PlotlyHTMLElement>;
    react(
      root: HTMLElement,
      data: object[],
      layout?: object,
      config?: object,
    ): Promise<PlotlyHTMLElement>;
    purge(root: HTMLElement): void;
  };

  export default Plotly;
}
