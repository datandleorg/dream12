/** Local/test matches may use ids 900001–900099; those are not SportMonks fixture ids. */
export function isSportmonksFixtureId(id: number): boolean {
  return id < 900_001 || id > 909_999;
}
