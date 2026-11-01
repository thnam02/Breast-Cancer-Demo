export interface LayerState {
  raw: boolean;
  grid: boolean;
  heatmap: boolean;
  top: boolean;
  opacity: number;
}

export interface ViewerApi {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}
