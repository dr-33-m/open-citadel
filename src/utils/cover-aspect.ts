/**
 * Width over height of the picture drawn for something heard as a book: a
 * book's cover stands as a book does; a blog post's picture is square, as a
 * feed's artwork is, rather than a wide photo cut down to a tall strip.
 */
export function coverAspect(post: boolean): number {
  return post ? 1 : 2 / 3;
}
