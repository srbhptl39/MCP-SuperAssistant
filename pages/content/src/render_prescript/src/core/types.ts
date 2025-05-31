// Core type definitions used throughout the application

/**
 * Configuration options for the function call renderer
 */
export interface FunctionCallRendererConfig {
  knownLanguages: string[];
  handleLanguageTags: boolean;
  maxLinesAfterLangTag: number;
  targetSelectors: string[];
  enableDirectMonitoring: boolean;
  streamingContainerSelectors: string[];
  updateThrottle: number;
  streamingMonitoringInterval: number;
  largeContentThreshold: number;
  progressiveUpdateInterval: number;
  maxContentPreviewLength: number;
  usePositionFixed: boolean;
  stabilizeTimeout: number;
  debug: boolean;
  // Theme detection
  useHostTheme: boolean;
  // Stalled stream detection
  enableStalledStreamDetection: boolean;
  stalledStreamTimeout: number;
  stalledStreamCheckInterval: number;
}

/**
 * Parameter data extracted from function calls
 */
export interface Parameter {
  name: string;
  value: string;
  isComplete: boolean;
  isNew?: boolean;
  isStreaming?: boolean;
  originalContent?: string;
  isLargeContent?: boolean;
  contentLength?: number;
  truncated?: boolean;
  isIncompleteTag?: boolean;
}

/**
 * Information about a function call detection
 */
export interface FunctionInfo {
  hasFunctionCalls: boolean;
  isComplete: boolean;
  hasInvoke: boolean;
  hasParameters: boolean;
  hasClosingTags: boolean;
  languageTag: string | null;
  detectedBlockType: string | null;
  partialTagDetected: boolean;
  invokeName?: string;
}

/**
 * Interface for tracking partial parameter state during streaming
 */
export interface PartialParameterState {
  [paramName: string]: string;
}

/**
 * Interface for custom HTMLDivElement with added properties for auto-scrolling
 */
export interface ParamValueElement extends HTMLDivElement {
  _autoScrollToBottom?: () => void;
  _autoScrollObserver?: MutationObserver;
  _scrollTimeout?: number | null;
  _userHasScrolled?: boolean;
  _scrollListener?: EventListener;
}

/**
 * Stabilized block information
 */
export interface StabilizedBlock {
  block: HTMLDivElement;
  placeholder: HTMLDivElement;
  originalStyles: Partial<CSSStyleDeclaration>;
}
