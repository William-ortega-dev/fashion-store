export function mapProduct(row) {
  if (!row) return row;
  const { sizes, colors, featured, category_id, ...rest } = row;
  return { ...rest, sizes: JSON.parse(sizes), colors: JSON.parse(colors), featured: Boolean(featured), categoryId: category_id };
}
