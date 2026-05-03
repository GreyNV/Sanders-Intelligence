import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import DataFreshnessBar from './DataFreshnessBar'

export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DataFreshnessBar />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
