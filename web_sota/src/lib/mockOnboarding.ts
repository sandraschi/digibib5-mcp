/** MOCK-until-onboarded sample library stats (ONBOARDING_STANDARD §webapp). */
export interface MockKpis {
	volumes: number;
	records: number;
	figures: number;
	indexed: number;
}

export const MOCK_KPIS: MockKpis = {
	volumes: 76,
	records: 41208,
	figures: 412,
	indexed: 12,
};

/** True once a real library is detected (configured). Clears all mock UI. */
export function isOnboardedLibrary(volumeCount: number): boolean {
	return volumeCount > 0;
}
