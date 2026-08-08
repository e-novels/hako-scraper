type ExtensionLogValue = unknown

type ExtensionMaybePromise<T> = T | Promise<T>

type ThemeVariableName = string

interface ExtensionFetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  credentials?: 'include' | 'omit'
}

interface ExtensionError extends Error {
  code?: string
  cause?: unknown
}

interface ExtensionNetworkApi {
  fetchText(url: string, options?: ExtensionFetchOptions): Promise<string>
  fetchJson<T = unknown>(url: string, options?: ExtensionFetchOptions): Promise<T>
  fetchDataUrl(url: string, options?: ExtensionFetchOptions): Promise<string>
}

interface ExtensionStorageApi {
  get<T = unknown>(key: string): Promise<T | File | null>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  createAssetUrl(relativePath: string): Promise<string | null>
}

interface ExtensionSettingsActionResult {
  success: boolean
  message?: string
}

interface ExtensionSettingsApi {
  register(
    handlers: Record<
      string,
      (values: Record<string, unknown>) => ExtensionSettingsActionResult | Promise<ExtensionSettingsActionResult>
    >
  ): Promise<void>
}

interface ExtensionProcessSpawnOptions {
  executable: string
  args?: string[]
  env?: Record<string, string>
}

interface ExtensionProcessSpawnResult {
  processId: string
  success: boolean
}

interface ExtensionProcessApi {
  spawn(options: ExtensionProcessSpawnOptions): Promise<ExtensionProcessSpawnResult>
  kill(processId: string): Promise<boolean>
  writeLine(processId: string, line: string): Promise<void>
  onLine(processId: string, callback: (line: string) => void): () => void
}

interface ExtensionProgressReportData {
  message: string
  percentage?: number
}

interface ExtensionProgressApi {
  report(data: ExtensionProgressReportData): Promise<void>
}

interface NovelExtensionApi {
  readonly version: string
  readonly platform: 'darwin' | 'win32' | 'linux' | 'web' | string
  readonly extension: { readonly id: string; readonly manifest?: Record<string, any> }
  readonly logger: {
    info(...values: ExtensionLogValue[]): Promise<void>
    warn(...values: ExtensionLogValue[]): Promise<void>
    error(...values: ExtensionLogValue[]): Promise<void>
  }
  readonly scraper: ExtensionScraperApi
  readonly settings: ExtensionSettingsApi
  readonly translator?: ExtensionTranslatorApi
  readonly tts?: ExtensionTTSApi
  readonly process?: ExtensionProcessApi
  readonly progress?: ExtensionProgressApi
  readonly network?: ExtensionNetworkApi
  readonly storage?: ExtensionStorageApi
  readonly ui?: {
    applyTheme(variables: Partial<Record<ThemeVariableName, string>>): Promise<void>
  }
}

type ExtensionSettingField =
  | {
      id: string
      type: 'text' | 'password' | 'url' | 'email'
      label: string
      description?: string
      placeholder?: string
      required?: boolean
      defaultValue?: string
    }
  | {
      id: string
      type: 'number'
      label: string
      description?: string
      required?: boolean
      min?: number
      max?: number
      step?: number
      defaultValue?: number
    }
  | {
      id: string
      type: 'checkbox'
      label: string
      description?: string
      required?: boolean
      defaultValue?: boolean
    }
  | {
      id: string
      type: 'select'
      label: string
      description?: string
      required?: boolean
      options: Array<{ label: string; value: string }>
      defaultValue?: string
    }
  | {
      id: string
      type: 'textarea'
      label: string
      description?: string
      placeholder?: string
      required?: boolean
      rows?: number
      defaultValue?: string
    }

interface ExtensionSettingsAction {
  id: string
  label: string
  fields?: string[]
  style?: 'primary' | 'danger' | 'default'
  confirm?: string
  longRunning?: boolean
}