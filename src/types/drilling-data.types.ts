export interface DrillingMessage {
  timestamp: number;
  payload: {
    [tag: string]: number;
  };
}

export interface NotionDrillingRow {
  [key: string]: number;
}

export interface SSEClient {
  id: string;
  response: any;
  connectedAt: Date;
}
