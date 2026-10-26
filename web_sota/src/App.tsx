import { Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer";
import { Shell } from "./components/Shell";
import { ChatPage } from "./pages/ChatPage";
import { Dashboard } from "./pages/Dashboard";
import { HelpPage } from "./pages/HelpPage";
import { LogsPage } from "./pages/LogsPage";
import { ReaderPage } from "./pages/ReaderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DigibibToolRunner } from "./pages/ToolRunnerPage";
import { DigibibToolsPage } from "./pages/ToolsPage";

export default function App() {
	return (
		<Shell>
			<Routes>
				<Route path="/" element={<Dashboard />} />
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
