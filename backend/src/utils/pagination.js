const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parseListQuery(query, allowedSorts = [], defaultSort = "createdAt:desc") {
  const page = Math.max(Number.parseInt(query.page ?? DEFAULT_PAGE, 10) || DEFAULT_PAGE, 1);
  const pageSize = Math.min(
    Math.max(Number.parseInt(query.pageSize ?? DEFAULT_PAGE_SIZE, 10) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );

  const [requestedField, requestedDirection] = String(query.sort ?? defaultSort).split(":");
  const field = allowedSorts.includes(requestedField) ? requestedField : defaultSort.split(":")[0];
  const direction = requestedDirection === "asc" ? "asc" : "desc";

  return {
    search: String(query.search ?? "").trim(),
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    sortField: field,
    sortDirection: direction,
  };
}

export function buildMeta({ total, page, pageSize, sortField, sortDirection }) {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    sort: `${sortField}:${sortDirection}`,
  };
}
