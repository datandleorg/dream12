/** Matches seeded in 20260328000000_seed_mock_data.sql use ids 900001–900099; not in SportMonks. */
export function isSportmonksFixtureId(id: number): boolean {
  return id < 900_001 || id > 909_999;
}
