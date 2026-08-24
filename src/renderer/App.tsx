import { apiClient, type PlannerApi } from './api/client';
import { AppShell } from './layout/AppShell';

export function App({ api = apiClient }: { api?: PlannerApi }) { return <AppShell api={api} />; }
