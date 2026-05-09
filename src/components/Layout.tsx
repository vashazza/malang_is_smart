import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/", label: "홈" },
  { to: "/session", label: "세션" },
  { to: "/history", label: "기록" },
  { to: "/stats", label: "통계" },
];

export default function Layout() {
  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto bg-white shadow-sm">
      <header className="px-4 py-3 border-b">
        <h1 className="text-xl font-bold text-slate-900">스마트 말랑이</h1>
        <p className="text-xs text-slate-500">쥐락펴락</p>
      </header>
      <main className="flex-1 p-4 overflow-y-auto">
        <Outlet />
      </main>
      <nav className="border-t flex">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) =>
              `flex-1 text-center py-3 text-sm ${
                isActive
                  ? "text-indigo-600 font-semibold border-t-2 border-indigo-600 -mt-px"
                  : "text-slate-500"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
