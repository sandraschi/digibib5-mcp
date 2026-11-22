import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer";
import { LibraryOnboardingModal } from "./components/LibraryOnboardingModal";
import { Shell } from "./components/Shell";
import {
	fetchLibrarySettings,
	type LibrarySettings,
} from "./lib/librarySettings";
import { CatalogPage } from "./pages/CatalogPage";
import { ChatPage } from "./pages/ChatPage";
import { Dashboard } from "./pages/Dashboard";
import { HelpPage } from "./pages/HelpPage";
import { LogsPage } from "./pages/LogsPage";
import { ReaderPage } from "./pages/ReaderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DigibibToolRunner } from "./pages/ToolRunnerPage";
import { DigibibToolsPage } from "./pages/ToolsPage";

export default function App() {
	const [onboarding, setOnboarding] = useState<LibrarySettings | null>(null);
	const [libraryEpoch, setLibraryEpoch] = useState(0);

	useEffect(() => {
		fetchLibrarySettings()
			.then((cfg) => {
				if (!cfg.onboarded) setOnboarding(cfg);
			})
			.catch(() => {
				/* backend offline; don't block UI */
			});
	}, []);

	return (
		<Shell>
			{onboarding && (
				<LibraryOnboardingModal
					initial={onboarding}
					onDone={() => {
						setOnboarding(null);
						setLibraryEpoch((e) => e + 1);
					}}
				/>
			)}
			<Routes key={libraryEpoch}>
				<Route path="/" element={<Dashboard />} />
				<Route path="/catalog" element={<CatalogPage />} />
				<Route path="/reader" element={<ReaderPage />} />
				<Route path="/tools" element={<DigibibToolsPage />} />
				<Route path="/tools/:name" element={<DigibibToolRunner />} />
				<Route path="/chat" element={<ChatPage />} />
				<Route path="/settings" element={<SettingsPage />} />
				<Route path="/logs" element={<LogsPage />} />
				<Route path="/help" element={<HelpPage />} />
			</Routes>
			<Footer />
		</Shell>
	);
}
