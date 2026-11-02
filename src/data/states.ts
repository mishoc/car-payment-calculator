/** Loads every state record from data/states/*.json at build time. */
const modules = import.meta.glob<unknown>('../../data/states/*.json', {
  eager: true,
  import: 'default',
})

export interface StateFile {
  /** File name without extension, e.g. "IL". */
  fileCode: string
  json: unknown
}

export const stateFiles: StateFile[] = Object.entries(modules)
  .map(([path, json]) => ({
    fileCode: path
      .split('/')
      .pop()!
      .replace(/\.json$/, ''),
    json,
  }))
  .sort((a, b) => a.fileCode.localeCompare(b.fileCode))
