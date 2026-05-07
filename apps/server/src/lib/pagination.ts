import { z } from '@hono/zod-openapi'

export const PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).describe('页码'),
    size: z.coerce.number().int().min(1).max(100).default(20).describe('每页数量'),
  })
  .openapi('PaginationQuery')

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  size: number
  totalPages: number
}

export function paginateResult<T>(items: T[], total: number, page: number, size: number): PaginatedResult<T> {
  return { items, total, page, size, totalPages: Math.ceil(total / size) }
}
