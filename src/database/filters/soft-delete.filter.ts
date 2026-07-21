/**
 * Global soft-delete filter.
 *
 * MikroORM v7 removed the built-in `SoftDeletableFilter` that v6 shipped, so
 * the filter is declared explicitly on each soft-deletable entity and applied
 * by default. That means every read/update against these entities excludes
 * rows whose `deletedAt` is set, without each call site having to remember to
 * add the predicate.
 *
 * To include soft-deleted rows (admin tooling, audit reads, cleanup jobs),
 * opt out per query: `em.find(Entity, where, { filters: { softDelete: false } })`.
 *
 * NOTE: `Activity` has no `deletedAt` column and deliberately does not use this.
 */
export const softDeleteFilters = {
  softDelete: {
    name: "softDelete",
    cond: { deletedAt: null },
    default: true,
  },
};
