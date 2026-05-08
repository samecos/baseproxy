export interface Config {
  auth: {
    valid_tokens: string[];
  };
  models: {
    [modelName: string]: ModelConfig;
  };
}

export interface ModelConfig {
  type: 'anthropic' | 'openai';
  endpoint: string;
  keys: string[];
  lb_strategy: 'round_robin';
}

// Anthropic Request Format
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: any }>;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  [key: string]: any;
}

// OpenAI Request Format
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  [key: string]: any;
}
