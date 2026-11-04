import { StateRecordSchema, type StateRecord } from './schema'

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

/** Parsed records for the app, sorted by state name. CI validates the files in full. */
export const stateRecords: StateRecord[] = stateFiles
  .map((f) => StateRecordSchema.parse(f.json))
  .sort((a, b) => a.name.localeCompare(b.name))
