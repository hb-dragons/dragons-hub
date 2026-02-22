import {
  createParser,
  parseAsArrayOf,
  type inferParserType,
} from "nuqs/server"

export const sortingItemParser = createParser({
  parse(queryValue) {
    const [id, desc] = queryValue.split(".")
    if (!id) return null
    return { id, desc: desc === "desc" }
  },
  serialize({ id, desc }) {
    return `${id}.${desc ? "desc" : "asc"}`
  },
  eq(a, b) {
    return a.id === b.id && a.desc === b.desc
  },
})

export const getSortingStateParser = (originalId?: string) => {
  const itemParser = originalId
    ? createParser({
        parse(queryValue) {
          const [id, desc] = queryValue.split(".")
          if (!id) return null
          return { id: id === originalId ? originalId : id, desc: desc === "desc" }
        },
        serialize({ id, desc }) {
          return `${id}.${desc ? "desc" : "asc"}`
        },
        eq(a, b) {
          return a.id === b.id && a.desc === b.desc
        },
      })
    : sortingItemParser
  return parseAsArrayOf(itemParser).withDefault([])
}

export type SortingState = inferParserType<ReturnType<typeof getSortingStateParser>>
