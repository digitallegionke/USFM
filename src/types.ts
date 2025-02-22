export interface USFMConverterProps {
  apiKey: string | null;
  setApiKey: (key: string) => void;
}

export interface ConversionResult {
  success: boolean;
  usfm?: string;
  error?: string;
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterChoice {
  message: {
    content: string;
    role: string;
  };
  finish_reason: string;
}

export interface OpenRouterResponse {
  id: string;
  choices: OpenRouterChoice[];
  model: string;
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

export interface OpenRouterError {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}