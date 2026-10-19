import { BrandMark } from "../components/shared/BrandMark";
import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  Menu,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { navigation, routeTitles } from "./navigation";
import { command, recoveredStorage, useAppDispatch, useDemo } from "../store";
import { Modal, StatusControl, useToast } from "../components/ui";
import { Help, PeriodSelector } from "../components/shared/Common";
import { Assistant } from "../features/Assistant";
import type { Role } from "../types/domain";
export function Shell() {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    location = useLocation(),
    navigate = useNavigate(),
    toast = useToast();
  const [navExpanded, setNavExpanded] = useState(false);
  const [mobile, setMobile] = useState(false),
    [assistant, setAssistant] = useState(false),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState<string[]>([]),
    [notice, setNotice] = useState(false);
  useEffect(() => {
    setMobile(false);
    const title =
      routeTitles[location.pathname] ||
      location.pathname
        .split("/")
        .filter(Boolean)
        .at(-1)
        ?.replaceAll("-", " ") ||
      "Workspace";
    document.title = `${title} · FinAI`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "Explore the fictional Northstar Analytics workspace in FinAI. Browser-local accounting records, reports, and review workflows.",
      );
    document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    if (recoveredStorage)
      toast(
        "Invalid or older saved data was safely replaced with the balanced seed.",
      );
    const handler = () =>
      toast(
        "Browser storage is unavailable. Changes remain in memory for this session.",
      );
    window.addEventListener("finai-storage-error", handler);
    return () => window.removeEventListener("finai-storage-error", handler);
  }, [toast]);
  const sidebar = (
    <>
      <Link className="brand" to="/overview">
        <BrandMark />
        FinAI
        <span className="brand-dot" />
      </Link>
      <div className="workspace-selector">
        <span className="workspace-avatar">N</span>
        <div>
          <strong>{s.workspace}</strong>
          <span>Demo workspace</span>
        </div>
        <ChevronsUpDown size={14} />
      </div>
      <nav aria-label="Main navigation">
        {navigation.map((group) => (
          <div className="nav-group" key={group.group}>
            <button
              className="nav-group-label"
              aria-expanded={!collapsed.includes(group.group)}
              onClick={() =>
                setCollapsed((c) =>
                  c.includes(group.group)
                    ? c.filter((v) => v !== group.group)
                    : [...c, group.group],
                )
              }
            >
              {group.group}
              <ChevronDown size={12} />
            </button>
            {!collapsed.includes(group.group) &&
              group.items.map((item) => (
                <NavLink
                  aria-label={item.label}
                  title={item.label}
                  key={item.path}
                  to={item.path}
                  end={item.path === "/close"}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                >
                  <item.icon size={17} />
                  {item.label}
                  {item.label === "FinAI Assistant" && (
                    <span className="new-tag">AI</span>
                  )}
                </NavLink>
              ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <CircleHelp size={16} />
        <Help />
        <Link to="/" aria-label="FinAI homepage" title="FinAI homepage">
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
  return (
    <div
      className={`app ${navExpanded ? "nav-expanded" : ""} ${s.compact ? "compact" : ""}`}
    >
      <aside className="sidebar">{sidebar}</aside>
      <Modal
        open={mobile}
        onOpenChange={setMobile}
        title="FinAI navigation"
        drawer
      >
        <div className="mobile-sidebar">{sidebar}</div>
      </Modal>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn desktop-nav-toggle"
              aria-label={
                navExpanded ? "Collapse navigation" : "Expand navigation"
              }
              title={navExpanded ? "Collapse navigation" : "Expand navigation"}
              onClick={() => setNavExpanded((v) => !v)}
            >
              <Menu size={18} />
            </button>
            <button
              className="icon-btn mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {routeTitles[location.pathname] ||
                location.pathname
                  .split("/")
                  .filter(Boolean)
                  .at(-1)
                  ?.replaceAll("-", " ")}
            </strong>
          </div>
          <div className="top-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/accounting/ledger?q=${encodeURIComponent(search)}`);
              }}
            >
              <Search size={15} />
              <input
                aria-label="Search workspace"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search anything…"
              />
              <kbd>↵</kbd>
            </form>
            <button
              className="icon-btn notification-dot"
              aria-label="Notifications"
              onClick={() => setNotice(true)}
            >
              <Bell size={18} />
              {s.notifications && <i />}
            </button>
            <Dropdown.Root>
              <Dropdown.Trigger
                className="avatar"
                aria-label="Profile and demo role"
              >
                {s.profile
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content
                  className="dropdown"
                  align="end"
                  sideOffset={8}
                >
                  <div className="dropdown-heading">
                    {s.profile}
                    <small>Local demo persona</small>
                  </div>
                  {(["Admin", "Accountant", "Reviewer"] as Role[]).map(
                    (role) => (
                      <Dropdown.Item
                        key={role}
                        onSelect={() =>
                          dispatch(command({ kind: "scope", role }))
                        }
                      >
                        {role}
                        {s.role === role ? " ✓" : ""}
                      </Dropdown.Item>
                    ),
                  )}
                  <Dropdown.Separator />
                  <Dropdown.Item
                    onSelect={() => navigate("/settings/preferences")}
                  >
                    Preferences
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </header>
        <div className="contextbar">
          <select
            className="entity-select"
            aria-label="Entity"
            value={s.entity}
            onChange={(e) =>
              dispatch(command({ kind: "scope", entity: e.target.value }))
            }
          >
            {s.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <div className="context-right">
            <span className="demo-indicator">
              <i />
              Demo workspace
            </span>
            <PeriodSelector />
            <button
              className="assistant-button"
              onClick={() => setAssistant(true)}
            >
              <Sparkles size={15} />
              Ask FinAI
            </button>
          </div>
        </div>
        <main tabIndex={-1}>
          <StatusControl
            key={
              location.pathname +
              (new URLSearchParams(location.search).get("demoState") || "ready")
            }
          >
            <Outlet />
          </StatusControl>
        </main>
        <footer className="app-footer">
          <span>FinAI · Local demo · USD</span>
          <span>{s.role} persona · Data through Sep 2026</span>
        </footer>
      </div>
      <Modal
        open={assistant}
        onOpenChange={setAssistant}
        title="FinAI Assistant"
        drawer
      >
        <Assistant embedded onNavigate={() => setAssistant(false)} />
      </Modal>
      <Modal
        open={notice}
        onOpenChange={setNotice}
        title="Workspace notifications"
      >
        <p className="muted">
          {s.notifications
            ? "Recent local activity"
            : "Notifications paused in preferences"}
        </p>
        {s.notifications &&
          s.audit.slice(0, 6).map((a) => (
            <div className="activity-item" key={a.id}>
              <span className="activity-dot" />
              <div>
                <strong>{a.action}</strong>
                <p>
                  {a.object} · {a.actor}
                </p>
              </div>
            </div>
          ))}
        <button
          onClick={() => {
            setNotice(false);
            navigate("/audit-log");
          }}
        >
          View audit log
        </button>
      </Modal>
      <button className="sr-only" onClick={() => setAssistant(false)}>
        <X />
        Close assistant
      </button>
    </div>
  );
}
