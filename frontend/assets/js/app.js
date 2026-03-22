const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const AUTH_LOCAL_STORAGE_KEY = "pricetool-auth-session";
const AUTH_SESSION_STORAGE_KEY = "pricetool-auth-session-temporary";
const API_BASE_STORAGE_KEY = "pricetool-api-base";
const DEFAULT_FILE_API_BASE = "http://localhost:3000/api";
const LANDING_ENTRY = "index.html";
const WORKSPACE_HOME = "overview.html";
const SEARCH_DEBOUNCE_MS = 260;
const DISPLAY_LOCALE = "en-US";

const numberFormatter = new Intl.NumberFormat(DISPLAY_LOCALE);
const shortDateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  month: "short",
  day: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const relativeTimeFormatter =
  typeof Intl.RelativeTimeFormat === "function"
    ? new Intl.RelativeTimeFormat(DISPLAY_LOCALE, { numeric: "auto" })
    : null;

const state = {
  page: "",
  session: null,
  apiBase: "",
};

document.documentElement.classList.add("js");

document.addEventListener("DOMContentLoaded", () => {
  bootstrap().catch((error) => {
    console.error(error);
    setPageStatus(error.message || "Something went wrong while loading the workspace.", "error");
  });
});

async function bootstrap() {
  state.page = getCurrentPage();
  state.apiBase = resolveApiBase();

  initMobileNav();

  if (state.page === "landing") {
    await initLandingPage();
    initRevealMotion();
    return;
  }

  if (!state.page) {
    return;
  }

  state.session = await requireWorkspaceSession();
  if (!state.session) {
    return;
  }

  updateUserPills(state.session);
  hydrateWorkspaceIdentity(state.session);

  const bootstrappers = {
    overview: initOverviewPage,
    watchlist: initWatchlistPage,
    "sku-detail": initSkuDetailPage,
    alerts: initAlertsPage,
    suppliers: initSuppliersPage,
    settings: initSettingsPage,
    "quote-builder": initQuoteBuilderPage,
  };

  if (bootstrappers[state.page]) {
    await bootstrappers[state.page](state.session);
  }

  initSortableTables();
  initRevealMotion();
}

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function debounce(callback, delay = SEARCH_DEBOUNCE_MS) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleCase(value) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatCount(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "0";
  }

  return numberFormatter.format(numeric);
}

function formatRelative(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  if (!relativeTimeFormatter) {
    return shortDateFormatter.format(date);
  }

  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / (1000 * 60));
  const hours = Math.round(diff / (1000 * 60 * 60));
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (Math.abs(minutes) < 60) {
    return relativeTimeFormatter.format(minutes, "minute");
  }

  if (Math.abs(hours) < 48) {
    return relativeTimeFormatter.format(hours, "hour");
  }

  if (Math.abs(days) < 31) {
    return relativeTimeFormatter.format(days, "day");
  }

  return shortDateFormatter.format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return dateTimeFormatter.format(date);
}

function formatDateTimeInputValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part) => String(part).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseIdList(rawValue) {
  if (!rawValue) {
    return [];
  }

  return Array.from(
    new Set(
      String(rawValue)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function buildQuery(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
      return;
    }

    searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  });

  return searchParams.toString();
}

function updateSearchParam(key, value) {
  const url = new URL(window.location.href);

  if (value == null || value === "") {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }

  window.history.replaceState({}, "", url);
}

function replaceSearchParams(nextValues) {
  const url = new URL(window.location.href);

  Object.entries(nextValues).forEach(([key, value]) => {
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
      url.searchParams.delete(key);
      return;
    }

    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  });

  window.history.replaceState({}, "", url);
}

function isWorkspacePage() {
  return Boolean(state.page) && state.page !== "landing";
}

function getCurrentPage() {
  return document.body?.dataset?.page || "";
}

function getRootPrefix() {
  return isWorkspacePage() ? "../../" : "./";
}

function getRootRelativePath(path) {
  return `${getRootPrefix()}${path.replace(/^\.?\//, "")}`;
}

function getWorkspacePathFromRoot(path = WORKSPACE_HOME) {
  return `./pages/workspace/${path.replace(/^\.?\//, "")}`;
}

function getWorkspacePageHref(path = WORKSPACE_HOME, params = {}) {
  const basePath = isWorkspacePage() ? `./${path.replace(/^\.?\//, "")}` : getWorkspacePathFromRoot(path);
  const query = buildQuery(params);
  return query ? `${basePath}?${query}` : basePath;
}

function getWorkspaceReturnTo() {
  const currentPath = window.location.pathname.split("/").pop() || WORKSPACE_HOME;
  return `${getWorkspacePathFromRoot(currentPath)}${window.location.search}${window.location.hash}`;
}

function getSafeReturnTo(rawValue) {
  if (!rawValue) {
    return "";
  }

  const value = String(rawValue).trim();

  if (
    !value ||
    value.includes("..") ||
    /^(?:[a-z]+:)?\/\//i.test(value) ||
    value.toLowerCase().startsWith("javascript:") ||
    value.startsWith("/")
  ) {
    return "";
  }

  return `./${value.replace(/^\.?\//, "")}`;
}

function readCachedSession() {
  const persisted =
    window.localStorage.getItem(AUTH_LOCAL_STORAGE_KEY) ||
    window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);

  if (!persisted) {
    return null;
  }

  try {
    return JSON.parse(persisted);
  } catch (error) {
    clearCachedSession();
    return null;
  }
}

function getCacheMode() {
  if (window.localStorage.getItem(AUTH_LOCAL_STORAGE_KEY)) {
    return "local";
  }

  if (window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)) {
    return "session";
  }

  return null;
}

function cacheSession(session, remember = true) {
  clearCachedSession();

  const storage = remember ? window.localStorage : window.sessionStorage;
  const key = remember ? AUTH_LOCAL_STORAGE_KEY : AUTH_SESSION_STORAGE_KEY;
  storage.setItem(key, JSON.stringify(session));
}

function refreshCachedSession(session) {
  const cacheMode = getCacheMode();
  if (!cacheMode) {
    return;
  }

  cacheSession(session, cacheMode === "local");
}

function clearCachedSession() {
  window.localStorage.removeItem(AUTH_LOCAL_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function normalizeApiBase(rawValue) {
  const value = String(rawValue ?? "").trim().replace(/\/+$/, "");
  if (!value) {
    return "";
  }

  return /\/api(?:\/v1)?$/i.test(value) ? value : `${value}/api`;
}

function resolveApiBase() {
  const url = new URL(window.location.href);
  const queryValue = url.searchParams.get("apiBase");
  const explicit = normalizeApiBase(queryValue || window.PRICETOOL_API_BASE);

  if (explicit) {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, explicit);
    return explicit;
  }

  const stored = normalizeApiBase(window.localStorage.getItem(API_BASE_STORAGE_KEY));
  if (stored) {
    return stored;
  }

  if (window.location.protocol === "file:") {
    return DEFAULT_FILE_API_BASE;
  }

  return "/api";
}

function buildApiUrl(path) {
  const normalized = String(path).startsWith("/") ? path : `/${path}`;
  return `${state.apiBase}${normalized}`;
}

async function requestApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const requestOptions = {
    method: options.method || "GET",
    credentials: "include",
    headers,
  };

  if (options.body instanceof FormData) {
    requestOptions.body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildApiUrl(path), requestOptions);
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || response.statusText || "Request failed."
    );
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }

  return payload;
}

async function requestData(path, options) {
  const payload = await requestApi(path, options);
  return payload?.data ?? null;
}

async function requestEnvelope(path, options) {
  return requestApi(path, options);
}

async function downloadFromApi(path, fileName = "download.csv") {
  const response = await fetch(buildApiUrl(path), {
    credentials: "include",
  });

  if (!response.ok) {
    let message = "Download failed.";

    try {
      const payload = await response.json();
      message = payload?.error?.message || message;
    } catch (error) {
      // Ignore JSON parsing failures for downloads.
    }

    const downloadError = new Error(message);
    downloadError.status = response.status;
    throw downloadError;
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

async function fetchCurrentSession() {
  try {
    return await requestData("/auth/me");
  } catch (error) {
    if (error.status === 401) {
      clearCachedSession();
      return null;
    }

    throw error;
  }
}

async function requireWorkspaceSession() {
  const cached = readCachedSession();
  if (cached) {
    updateUserPills(cached);
  }

  const session = await fetchCurrentSession();
  if (session) {
    refreshCachedSession(session);
    return session;
  }

  const returnTo = getWorkspaceReturnTo();
  window.location.replace(
    `${getRootRelativePath(LANDING_ENTRY)}?login=1&returnTo=${encodeURIComponent(returnTo)}`
  );
  return null;
}

async function logoutCurrentSession() {
  try {
    await requestApi("/auth/logout", {
      method: "POST",
    });
  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }
  } finally {
    clearCachedSession();
  }
}

function hydrateWorkspaceIdentity(session) {
  const chips = $all(".workspace-topbar .chip");

  if (!chips.length || !session?.workspace) {
    return;
  }

  if (state.page === "overview") {
    chips[0].textContent = session.workspace.name;
    return;
  }

  if (state.page === "sku-detail") {
    chips[0].textContent = titleCase(session.role);
    if (chips[1]) {
      chips[1].textContent = session.workspace.timezone;
    }
    return;
  }

  chips[0].textContent = session.workspace.name;
}

function updateUserPills(session) {
  const label = session ? session.name.split(/\s+/)[0] : "Guest";
  const title = session
    ? `${session.name} · ${titleCase(session.role)} · ${session.workspace?.name ?? "Workspace"}`
    : "Guest access";

  $all(".user-pill").forEach((pill) => {
    pill.textContent = label;
    pill.title = title;
  });
}

function ensurePageStatus() {
  const existing = $("[data-page-status]") || $("[data-settings-status]");
  if (existing) {
    return existing;
  }

  const pageHead = $(".page-head");
  if (!pageHead?.parentElement) {
    return null;
  }

  const status = document.createElement("p");
  status.className = "page-status";
  status.dataset.pageStatus = "";
  pageHead.insertAdjacentElement("afterend", status);
  return status;
}

function setPageStatus(message, tone = "neutral") {
  const status = ensurePageStatus();
  if (!status) {
    return;
  }

  status.textContent = message || "";
  status.classList.remove("is-error", "is-success", "is-warning");

  if (tone === "error") {
    status.classList.add("is-error");
  } else if (tone === "success") {
    status.classList.add("is-success");
  } else if (tone === "warning") {
    status.classList.add("is-warning");
  }
}

function metricCardToneClass(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "badge";
  }

  if (numeric < 0) {
    return "badge rose";
  }

  if (numeric >= 5) {
    return "badge amber";
  }

  return "badge";
}

function watchlistStatusBadgeClass(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "escalate") {
    return "badge rose";
  }

  if (normalized === "review") {
    return "badge amber";
  }

  return "badge";
}

function severityBadgeClass(severity) {
  const normalized = String(severity ?? "").toLowerCase();
  if (normalized === "critical") {
    return "badge rose";
  }

  if (normalized === "high") {
    return "badge amber";
  }

  return "badge";
}

function quoteStatusBadgeClass(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "near") {
    return "badge amber";
  }

  if (normalized === "expired") {
    return "badge rose";
  }

  return "badge";
}

function packageStatusBadgeClass(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "pending_approval") {
    return "badge amber";
  }

  if (normalized === "rejected") {
    return "badge rose";
  }

  return "badge";
}

function dispatchStatusBadgeClass(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "scheduled") {
    return "badge amber";
  }

  if (normalized === "failed") {
    return "badge rose";
  }

  return "badge";
}

function renderSparkline(svg, values, labels = []) {
  if (!svg) {
    return;
  }

  const numbers = values
    .map((value) => Number(value))
    .filter((value) => !Number.isNaN(value));

  if (numbers.length < 2) {
    return;
  }

  const viewBox = svg.getAttribute("viewBox") || "0 0 640 240";
  const [, , widthValue, heightValue] = viewBox.split(/\s+/).map(Number);
  const width = Number.isFinite(widthValue) ? widthValue : 640;
  const height = Number.isFinite(heightValue) ? heightValue : 240;
  const paddingX = 18;
  const paddingTop = 24;
  const paddingBottom = 28;
  const minValue = Math.min(...numbers);
  const maxValue = Math.max(...numbers);
  const range = maxValue - minValue || 1;

  const points = numbers.map((value, index) => {
    const x =
      paddingX + (index * (width - paddingX * 2)) / Math.max(numbers.length - 1, 1);
    const y =
      height -
      paddingBottom -
      ((value - minValue) / range) * (height - paddingTop - paddingBottom);

    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(2)} ${(height - 8).toFixed(
    2
  )} L${points[0].x.toFixed(2)} ${(height - 8).toFixed(2)} Z`;

  const paths = $all("path", svg);
  const marker = $("circle", svg);

  if (paths[0]) {
    paths[0].setAttribute("d", areaPath);
  }

  if (paths[1]) {
    paths[1].setAttribute("d", linePath);
  }

  if (marker) {
    const lastPoint = points[points.length - 1];
    marker.setAttribute("cx", lastPoint.x.toFixed(2));
    marker.setAttribute("cy", lastPoint.y.toFixed(2));
  }

  const axisLabels = svg.parentElement?.querySelector(".axis-labels");
  if (axisLabels && labels.length) {
    axisLabels.innerHTML = labels
      .slice(-7)
      .map((label) => `<span>${escapeHtml(label)}</span>`)
      .join("");
  }
}

function summarizeVolatility(history) {
  const values = history
    .map((entry) => entry?.price?.value)
    .filter((value) => typeof value === "number");

  if (values.length < 2) {
    return "Limited data";
  }

  let totalChange = 0;
  for (let index = 1; index < values.length; index += 1) {
    totalChange += Math.abs(values[index] - values[index - 1]);
  }

  const averageChange = totalChange / (values.length - 1);
  const baseline = Math.max(Math.abs(values[0]), 1);
  const normalized = averageChange / baseline;

  if (normalized < 0.015) {
    return "Low volatility";
  }

  if (normalized < 0.035) {
    return "Low to medium";
  }

  if (normalized < 0.065) {
    return "Elevated";
  }

  return "High volatility";
}

function selectedRowClass(isSelected) {
  return isSelected ? ' class="is-selected"' : "";
}

function initMobileNav() {
  const shell = document.querySelector(".app-shell");
  const sidebar = document.querySelector(".sidebar");
  const topbar = document.querySelector(".workspace-topbar");

  if (!shell || !sidebar || !topbar) {
    return;
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "nav-toggle";
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = "<span></span><span></span><span></span>";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "sidebar-close";
  close.setAttribute("aria-label", "Close navigation");
  close.textContent = "Close";

  const overlay = document.createElement("button");
  overlay.type = "button";
  overlay.className = "sidebar-overlay";
  overlay.setAttribute("aria-label", "Close navigation");
  overlay.tabIndex = -1;

  topbar.prepend(toggle);
  sidebar.prepend(close);
  shell.appendChild(overlay);

  const closeNav = () => {
    shell.classList.remove("sidebar-open");
    document.body.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const openNav = () => {
    shell.classList.add("sidebar-open");
    document.body.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", () => {
    if (shell.classList.contains("sidebar-open")) {
      closeNav();
      return;
    }

    openNav();
  });

  close.addEventListener("click", closeNav);
  overlay.addEventListener("click", closeNav);

  sidebar.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeNav();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) {
      closeNav();
    }
  });
}

async function initLandingPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
  const shouldAutoOpen = searchParams.get("login") === "1" || searchParams.get("auth") === "open";
  const modalShell = $("#login-modal");
  const dialog = modalShell?.querySelector(".auth-modal");
  const trigger = $("[data-login-open]");

  if (!modalShell || !dialog || !trigger) {
    return;
  }

  const closeControls = modalShell.querySelectorAll("[data-login-close]");
  const providerButtons = modalShell.querySelectorAll("[data-auth-provider]");
  const form = modalShell.querySelector("[data-auth-form]");
  const guestView = modalShell.querySelector("[data-auth-guest]");
  const sessionView = modalShell.querySelector("[data-auth-session]");
  const signOutButton = modalShell.querySelector("[data-auth-signout]");
  const status = modalShell.querySelector("[data-auth-status]");
  const triggerLabel = document.querySelector("[data-login-label]");
  const avatar = modalShell.querySelector("[data-auth-avatar]");
  const nameTarget = modalShell.querySelector("[data-auth-name]");
  const metaTarget = modalShell.querySelector("[data-auth-meta]");
  const openWorkspaceLink = sessionView?.querySelector("a");
  const emailInput = form?.elements.namedItem("email");
  const nameInput = form?.elements.namedItem("name");
  const passwordInput = form?.elements.namedItem("password");
  const rememberInput = form?.elements.namedItem("remember");
  const heroPrimaryLink = $(".hero-actions .primary-btn");
  const heroSecondaryLink = $(".hero-actions .secondary-btn");

  let closeTimer = 0;
  let lastFocusedElement = null;
  let session = readCachedSession();

  const providerPresets = {
    sso: {
      email: "admin@quoteflow.local",
      name: "Eason Chen",
      providerLabel: "Enterprise preset loaded",
    },
    google: {
      email: "buyer@quoteflow.local",
      name: "Kelly Buyer",
      providerLabel: "Google preset loaded",
    },
    wechat: {
      email: "approver@quoteflow.local",
      name: "Victor Approver",
      providerLabel: "WeChat preset loaded",
    },
  };

  const getFocusableNodes = () =>
    Array.from(
      dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((node) => !node.hidden && node.offsetParent !== null);

  const setLandingLinks = (authenticated) => {
    if (!heroPrimaryLink || !heroSecondaryLink) {
      return;
    }

    if (authenticated) {
      heroPrimaryLink.href = "./pages/workspace/overview.html";
      heroPrimaryLink.textContent = "Open workspace";
      heroSecondaryLink.href = "./pages/workspace/alerts.html";
      heroSecondaryLink.textContent = "Open alerts";
      return;
    }

    heroPrimaryLink.href = "#board";
    heroPrimaryLink.textContent = "Open board";
    heroSecondaryLink.href = "#system";
    heroSecondaryLink.textContent = "Alert flow";
  };

  const updateSessionView = (currentSession) => {
    const authenticated = Boolean(currentSession);

    guestView.hidden = authenticated;
    sessionView.hidden = !authenticated;
    trigger.dataset.authenticated = authenticated ? "true" : "false";
    triggerLabel.textContent = authenticated ? currentSession.name : "Login";
    updateUserPills(currentSession);
    setLandingLinks(authenticated);

    if (!authenticated) {
      status.textContent = "Use a seeded demo account and QuoteFlow123! to enter QuoteFlow.";
      return;
    }

    const initials = currentSession.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((value) => value.charAt(0).toUpperCase())
      .join("");

    avatar.textContent = initials || "QF";
    nameTarget.textContent = currentSession.name;
    metaTarget.textContent = `${currentSession.email} · ${titleCase(currentSession.role)}`;
    if (openWorkspaceLink) {
      openWorkspaceLink.href = returnTo || "./pages/workspace/overview.html";
    }
    status.textContent = `${currentSession.workspace?.name ?? "Workspace"} session active.`;
  };

  const openModal = () => {
    window.clearTimeout(closeTimer);
    lastFocusedElement = document.activeElement;
    modalShell.hidden = false;
    document.body.classList.add("modal-open");
    trigger.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(() => {
      modalShell.classList.add("is-open");
      updateSessionView(session);
      const focusTarget = session
        ? sessionView.querySelector("a, button")
        : emailInput || providerButtons[0];
      focusTarget?.focus();
    });
  };

  const closeModal = () => {
    modalShell.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    trigger.setAttribute("aria-expanded", "false");

    closeTimer = window.setTimeout(() => {
      modalShell.hidden = true;
      lastFocusedElement?.focus?.();
    }, 260);
  };

  trigger.addEventListener("click", openModal);

  closeControls.forEach((control) => {
    control.addEventListener("click", closeModal);
  });

  providerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const preset = providerPresets[button.dataset.authProvider];
      if (!preset) {
        return;
      }

      if (emailInput) {
        emailInput.value = preset.email;
      }

      if (nameInput) {
        nameInput.value = preset.name;
      }

      status.textContent = `${preset.providerLabel}. Backend auth is currently wired through the local login form.`;
      passwordInput?.focus();
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const remember = rememberInput?.checked ?? true;

    status.textContent = "Signing in…";

    try {
      session = await requestData("/auth/login", {
        method: "POST",
        body: {
          email: emailInput.value.trim(),
          password: passwordInput.value,
          rememberMe: remember,
        },
      });

      cacheSession(session, remember);
      updateSessionView(session);
      form.reset();
      if (rememberInput) {
        rememberInput.checked = remember;
      }

      if (returnTo) {
        window.location.assign(returnTo);
        return;
      }

      status.textContent = "Signed in. You can open the workspace now.";
    } catch (error) {
      status.textContent = error.message || "Unable to sign in.";
    }
  });

  signOutButton?.addEventListener("click", async () => {
    status.textContent = "Signing out…";

    try {
      await logoutCurrentSession();
      session = null;
      updateSessionView(null);
      form?.reset();
      if (rememberInput) {
        rememberInput.checked = true;
      }
      status.textContent = "Signed out.";
      emailInput?.focus();
    } catch (error) {
      status.textContent = error.message || "Unable to sign out.";
    }
  });

  window.addEventListener("keydown", (event) => {
    if (modalShell.hidden) {
      return;
    }

    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableNodes = getFocusableNodes();
    if (!focusableNodes.length) {
      return;
    }

    const firstNode = focusableNodes[0];
    const lastNode = focusableNodes[focusableNodes.length - 1];

    if (event.shiftKey && document.activeElement === firstNode) {
      event.preventDefault();
      lastNode.focus();
    } else if (!event.shiftKey && document.activeElement === lastNode) {
      event.preventDefault();
      firstNode.focus();
    }
  });

  updateSessionView(session);

  try {
    session = await fetchCurrentSession();
  } catch (error) {
    status.textContent = error.message || "Unable to reach the API.";
  }

  if (session) {
    refreshCachedSession(session);
  }

  updateSessionView(session);

  if (session && returnTo) {
    window.location.replace(returnTo);
    return;
  }

  if (shouldAutoOpen && !session) {
    openModal();
  }
}

async function initOverviewPage(session) {
  setPageStatus("Loading overview…");

  const [overview, watchlistEnvelope] = await Promise.all([
    requestData("/dashboard/overview"),
    requestEnvelope("/watchlist?pageSize=1"),
  ]);

  const selectedSkuId = overview.topMovers?.[0]?.sku?.id || watchlistEnvelope?.data?.items?.[0]?.sku?.id || null;
  const pulseDetail = selectedSkuId
    ? await requestData(`/skus/${selectedSkuId}`).catch(() => null)
    : null;

  updateNavPills({
    watchlist: watchlistEnvelope?.meta?.total,
    alerts: overview.metrics?.activeAlerts,
  });

  const topbarChip = $(".workspace-topbar .chip");
  const notificationButton = $(".workspace-topbar .icon-btn");
  const metrics = $all(".metric");
  const splitPanels = $all(".split-grid .panel");
  const tableCards = $all(".card-grid-3 .table-card");
  const searchForm = $(".workspace-topbar .searchbar");
  const sidebarCard = $(".sidebar-card");
  const quotePackLink = $('.page-actions .primary-btn');

  if (topbarChip && session.workspace?.timezone) {
    topbarChip.textContent = session.workspace.timezone;
  }

  if (notificationButton) {
    notificationButton.textContent = formatCount(overview.metrics.activeAlerts);
    notificationButton.title = `${overview.metrics.activeAlerts} active alerts`;
  }

  const metricValues = [
    {
      value: formatCount(overview.metrics.trackedSkus),
      delta: `${formatCount(watchlistEnvelope?.meta?.total || 0)} on watchlist`,
    },
    {
      value: formatCount(overview.metrics.activeAlerts),
      delta: `${formatCount(overview.metrics.bestSavingWindow.itemCount)} actionable items`,
    },
    {
      value: overview.metrics.bestSavingWindow.display || "—",
      delta: `across ${formatCount(overview.metrics.bestSavingWindow.itemCount)} alerts`,
    },
    {
      value: formatCount(overview.metrics.supplierCoverage.count),
      delta: `${formatCount(overview.metrics.supplierCoverage.responsiveRatePercent)}% responsive`,
    },
  ];

  metrics.forEach((card, index) => {
    const strong = $("strong", card);
    const delta = $(".delta", card);
    if (strong) {
      strong.textContent = metricValues[index]?.value || "—";
    }
    if (delta) {
      delta.textContent = metricValues[index]?.delta || "";
    }
  });

  const marketPulsePanel = splitPanels[0];
  if (marketPulsePanel) {
    const badge = $(".section-head .badge", marketPulsePanel);
    const skuLabel = $(".curve-head span", marketPulsePanel);
    const movementLabel = $(".curve-head strong", marketPulsePanel);
    const signalCards = $all(".signal-card", marketPulsePanel);
    const sparkline = $(".curve-graphic", marketPulsePanel);

    if (badge) {
      badge.textContent = overview.marketPulse?.badge || "No movement";
      badge.className = metricCardToneClass(overview.marketPulse?.movement7dPercent);
    }

    if (skuLabel) {
      skuLabel.textContent = overview.marketPulse?.sku || "No tracked SKU";
    }

    if (movementLabel) {
      movementLabel.textContent = overview.marketPulse?.movementLabel || "—";
    }

    if (signalCards[0]) {
      $("strong", signalCards[0]).textContent = overview.signalStrip.bestGap || "—";
    }

    if (signalCards[1]) {
      $("strong", signalCards[1]).textContent = formatCount(overview.signalStrip.riskVendors);
    }

    if (signalCards[2]) {
      $("strong", signalCards[2]).textContent = overview.signalStrip.nextWindow || "—";
    }

    if (pulseDetail) {
      renderSparkline(
        sparkline,
        pulseDetail.trendHistory.map((point) => point.price.value),
        pulseDetail.trendHistory.map((point) => shortDateFormatter.format(new Date(point.recordedAt)))
      );
    }
  }

  const actionQueuePanel = splitPanels[1];
  if (actionQueuePanel) {
    const timelineList = $(".timeline-list", actionQueuePanel);
    timelineList.innerHTML = (overview.actionQueue || [])
      .map(
        (item) => `
          <div class="timeline-item">
            <span>${escapeHtml(item.slot || "Next")}</span>
            <p>${escapeHtml(item.label || "No action queued.")}</p>
          </div>
        `
      )
      .join("");
  }

  const topMoversCard = tableCards[0];
  if (topMoversCard) {
    const tbody = $("tbody", topMoversCard);
    tbody.innerHTML = (overview.topMovers || [])
      .map(
        (item) => `
          <tr>
            <td>
              <div class="row-title">
                <strong><a href="${escapeHtml(
                  getWorkspacePageHref("sku-detail.html", { skuId: item.sku.id })
                )}">${escapeHtml(item.sku.name)}</a></strong>
                <span>${escapeHtml(item.sku.code)}</span>
              </div>
            </td>
            <td class="mono">${escapeHtml(item.latestPrice.display || "—")}</td>
            <td><span class="${metricCardToneClass(item.trend7d.value)}">${escapeHtml(
              item.trend7d.display || "—"
            )}</span></td>
          </tr>
        `
      )
      .join("");
  }

  const supplierFocusCard = tableCards[1];
  if (supplierFocusCard) {
    const tbody = $("tbody", supplierFocusCard);
    tbody.innerHTML = (overview.supplierFocus || [])
      .map(
        (supplier) => `
          <tr>
            <td><strong><a href="${escapeHtml(
              getWorkspacePageHref("suppliers.html", { supplierId: supplier.id })
            )}">${escapeHtml(supplier.name)}</a></strong></td>
            <td>${escapeHtml(supplier.avgResponseLabel || "—")}</td>
            <td>${escapeHtml(`${supplier.winRatePercent}%`)}</td>
          </tr>
        `
      )
      .join("");
  }

  const movesCard = tableCards[2];
  if (movesCard) {
    const workflowGrid = $(".workflow-grid", movesCard);
    workflowGrid.innerHTML = (overview.suggestedMoves || [])
      .map(
        (step, index) => `
          <div class="workflow-step">
            <small>${String(index + 1).padStart(2, "0")}</small>
            <strong>${escapeHtml(step.step)}</strong>
            <p>${escapeHtml(step.copy)}</p>
          </div>
        `
      )
      .join("");
  }

  if (sidebarCard) {
    const copy = $("p", sidebarCard);
    const link = $("a", sidebarCard);
    if (copy) {
      copy.textContent = `${formatCount(overview.metrics.activeAlerts)} open alerts, ${formatCount(
        watchlistEnvelope?.meta?.total || 0
      )} lines on the watchlist, and ${overview.metrics.bestSavingWindow.display || "—"} in potential savings.`;
    }
    if (link) {
      link.href = getWorkspacePageHref("alerts.html");
    }
  }

  if (quotePackLink && overview.topMovers?.[0]?.sku?.id) {
    quotePackLink.href = getWorkspacePageHref("quote-builder.html", {
      fromSkuId: overview.topMovers[0].sku.id,
    });
  }

  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("input", searchForm)?.value?.trim();
    window.location.assign(getWorkspacePageHref("watchlist.html", { search: query || undefined }));
  });

  setPageStatus(
    `Loaded ${formatCount(overview.metrics.activeAlerts)} alerts and ${formatCount(
      watchlistEnvelope?.meta?.total || 0
    )} watchlist lines.`,
    "success"
  );
}

async function initWatchlistPage() {
  const searchInput = $("#watchlist-search");
  const exportButton = $(".workspace-topbar .secondary-btn");
  const metrics = $all(".metric");
  const table = $(".table-card");
  const tableBody = $("tbody", table);
  const pageActions = $all(".page-actions a");
  const inlineActions = $all(".inline-actions a");
  const sidebarCard = $(".sidebar-card");

  let selectedSkuId = new URLSearchParams(window.location.search).get("skuId");
  let activeSearch = new URLSearchParams(window.location.search).get("search") || "";
  let items = [];
  let meta = null;
  let summary = null;
  let loadToken = 0;

  if (searchInput) {
    searchInput.value = activeSearch;
  }

  const renderSelectionLinks = () => {
    const selected = items.find((item) => item.sku.id === selectedSkuId) || items[0];
    const selectedSupplierId = selected?.supplier?.id || null;

    if (selected) {
      selectedSkuId = selected.sku.id;
      updateSearchParam("skuId", selectedSkuId);
    }

    if (pageActions[0]) {
      pageActions[0].href = selectedSupplierId
        ? getWorkspacePageHref("suppliers.html", { supplierId: selectedSupplierId })
        : getWorkspacePageHref("suppliers.html");
    }

    if (pageActions[1]) {
      pageActions[1].href = selected
        ? getWorkspacePageHref("sku-detail.html", { skuId: selected.sku.id })
        : getWorkspacePageHref("sku-detail.html");
    }

    if (inlineActions[0]) {
      inlineActions[0].href = getWorkspacePageHref("alerts.html", {
        search: selected?.sku.code || activeSearch || undefined,
      });
    }

    if (inlineActions[1]) {
      inlineActions[1].href = selected
        ? getWorkspacePageHref("quote-builder.html", { fromSkuId: selected.sku.id })
        : getWorkspacePageHref("quote-builder.html");
    }

    if (sidebarCard) {
      const copy = $("p", sidebarCard);
      if (copy && selected) {
        copy.textContent = `${selected.sku.name} is ${selected.trend7d.display || "steady"}, best quote ${selected.bestQuote.display || "—"}, spread ${selected.spread.display || "—"}.`;
      }
    }
  };

  const render = () => {
    updateNavPills({
      watchlist: meta?.total,
    });

    metrics[0] && ($("strong", metrics[0]).textContent = formatCount(summary.openLines));
    metrics[0] && ($(".delta", metrics[0]).textContent = `${formatCount(summary.openCritical)} critical`);
    metrics[1] && ($("strong", metrics[1]).textContent = `${summary.averageSpreadPercent}%`);
    metrics[1] && ($(".delta", metrics[1]).textContent = "average movement across the slice");
    metrics[2] && ($("strong", metrics[2]).textContent = formatCount(summary.suppliersInView));
    metrics[2] && ($(".delta", metrics[2]).textContent = "suppliers represented");
    metrics[3] && ($("strong", metrics[3]).textContent = summary.potentialSaving.display || "—");
    metrics[3] && ($(".delta", metrics[3]).textContent = "sum of current actionable spread");

    tableBody.innerHTML = items
      .map(
        (item) => `
          <tr data-sku-id="${escapeHtml(item.sku.id)}"${selectedRowClass(item.sku.id === selectedSkuId)}>
            <td>
              <div class="row-title">
                <strong><a href="${escapeHtml(
                  getWorkspacePageHref("sku-detail.html", { skuId: item.sku.id })
                )}">${escapeHtml(item.sku.code)}</a></strong>
                <span>${escapeHtml(item.sku.name)}</span>
              </div>
            </td>
            <td>${escapeHtml(item.sku.category || "—")}</td>
            <td class="mono">${escapeHtml(item.bestQuote.display || "—")}</td>
            <td class="mono">${escapeHtml(item.spread.display || "—")}</td>
            <td><span class="${metricCardToneClass(item.trend7d.value)}">${escapeHtml(
              item.trend7d.display || "—"
            )}</span></td>
            <td>${escapeHtml(item.supplier?.name || "—")}</td>
            <td><span class="${watchlistStatusBadgeClass(item.status.value)}">${escapeHtml(
              item.status.label
            )}</span></td>
          </tr>
        `
      )
      .join("");

    renderSelectionLinks();

    setPageStatus(
      `Showing ${formatCount(meta?.total || 0)} watchlist lines${activeSearch ? ` for “${activeSearch}”` : ""}.`,
      "success"
    );
  };

  const load = async () => {
    const currentToken = ++loadToken;
    setPageStatus("Loading watchlist…");

    const result = await requestEnvelope(`/watchlist?${buildQuery({ pageSize: 100, search: activeSearch || undefined })}`);
    if (currentToken !== loadToken) {
      return;
    }

    items = result.data.items || [];
    summary = result.data.summary || {
      openLines: 0,
      openCritical: 0,
      averageSpreadPercent: 0,
      suppliersInView: 0,
      potentialSaving: { display: null },
    };
    meta = result.meta || { total: items.length };

    if (!items.some((item) => item.sku.id === selectedSkuId)) {
      selectedSkuId = items[0]?.sku.id || null;
    }

    render();
  };

  tableBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-sku-id]");
    if (!row) {
      return;
    }

    selectedSkuId = row.dataset.skuId;
    updateSearchParam("skuId", selectedSkuId);
    $all("tr[data-sku-id]", tableBody).forEach((element) => {
      element.classList.toggle("is-selected", element.dataset.skuId === selectedSkuId);
    });
    renderSelectionLinks();
  });

  exportButton?.addEventListener("click", async () => {
    try {
      await downloadFromApi(`/watchlist/export?${buildQuery({ search: activeSearch || undefined })}`, "watchlist.csv");
      setPageStatus("Watchlist CSV exported.", "success");
    } catch (error) {
      setPageStatus(error.message || "Unable to export the watchlist.", "error");
    }
  });

  searchInput?.addEventListener(
    "input",
    debounce(() => {
      activeSearch = searchInput.value.trim();
      updateSearchParam("search", activeSearch || null);
      load().catch((error) => setPageStatus(error.message || "Unable to load the watchlist.", "error"));
    })
  );

  await load();
}

async function resolveDefaultSkuId(search) {
  const query = buildQuery({
    pageSize: 1,
    search: search || undefined,
  });
  const result = await requestEnvelope(`/watchlist?${query}`);
  return result?.data?.items?.[0]?.sku?.id || null;
}

async function initSkuDetailPage() {
  const searchParams = new URLSearchParams(window.location.search);
  let skuId = searchParams.get("skuId");
  const searchInput = $("#sku-search");
  const searchForm = $(".workspace-topbar .searchbar");

  if (!skuId) {
    skuId = await resolveDefaultSkuId(searchParams.get("search") || "");
    if (skuId) {
      replaceSearchParams({ skuId });
    }
  }

  if (!skuId) {
    setPageStatus("No SKU is available in the watchlist yet.", "warning");
    return;
  }

  setPageStatus("Loading SKU detail…");

  const detail = await requestData(`/skus/${skuId}`);
  const chips = $all(".workspace-topbar .chip");
  const sidebarCard = $(".sidebar-card");
  const pageHead = $(".page-head");
  const pageActions = $all(".page-actions a");
  const trendPanel = $(".detail-split .panel");
  const recommendationCard = $(".detail-split .detail-card");
  const bottomCards = $all(".card-grid-3 .table-card");

  updateSearchParam("skuId", detail.id);

  if (searchInput) {
    searchInput.placeholder = `${detail.code} / ${detail.name}`;
  }

  if (chips[0]) {
    chips[0].textContent = detail.category || "—";
  }
  if (chips[1]) {
    chips[1].textContent = detail.region ? `${detail.region} region` : "Region not set";
  }

  if (sidebarCard) {
    const heading = $("strong", sidebarCard);
    const copy = $("p", sidebarCard);
    const link = $("a", sidebarCard);
    if (heading) {
      heading.textContent = detail.name;
    }
    if (copy) {
      copy.textContent = `${detail.currentPrice.display || "—"} now, ${detail.movement30d.display || "—"} over 30 days, ${formatCount(
        detail.supplierSummary.responseRiskCount
      )} response risks open.`;
    }
    if (link) {
      link.href = getWorkspacePageHref("quote-builder.html", { fromSkuId: detail.id });
    }
  }

  if (pageHead) {
    $("h1", pageHead).textContent = detail.name;
    $("p", pageHead).textContent = `${detail.code} · ${detail.category || "Uncategorised"} · ${
      detail.currentPrice.display || "No current price"
    }`;
  }

  if (pageActions[1]) {
    pageActions[1].href = getWorkspacePageHref("quote-builder.html", { fromSkuId: detail.id });
  }

  if (trendPanel) {
    const priceBadge = $(".section-head .badge", trendPanel);
    const curveHead = $(".curve-head", trendPanel);
    const signalCards = $all(".signal-card", trendPanel);
    const chart = $(".curve-graphic", trendPanel);

    if (priceBadge) {
      priceBadge.textContent = `Now ${detail.currentPrice.display || "—"}`;
    }
    if (curveHead) {
      $("span", curveHead).textContent = "Volatility";
      $("strong", curveHead).textContent = summarizeVolatility(detail.trendHistory);
    }
    if (signalCards[0]) {
      $("strong", signalCards[0]).textContent = detail.supplierSummary.bestSupplier?.name || "—";
    }
    if (signalCards[1]) {
      $("strong", signalCards[1]).textContent = detail.supplierSummary.quoteSpread.display || "—";
    }
    if (signalCards[2]) {
      $("strong", signalCards[2]).textContent = `${formatCount(detail.supplierSummary.responseRiskCount)} vendors`;
    }

    renderSparkline(
      chart,
      detail.trendHistory.map((point) => point.price.value),
      detail.trendHistory.map((point) => shortDateFormatter.format(new Date(point.recordedAt)))
    );
  }

  if (recommendationCard) {
    const badge = $(".detail-head .badge", recommendationCard);
    const fields = $all(".field", recommendationCard);

    if (badge) {
      badge.textContent = detail.movement30d.display ? "Live" : "Watch";
      badge.className = metricCardToneClass(detail.movement30d.value);
    }

    if (fields[0]) {
      $("strong", fields[0]).textContent = detail.recommendation.primaryMove;
      $("p", fields[0]).textContent = `Window: ${detail.recommendation.window}`;
    }
    if (fields[1]) {
      $("strong", fields[1]).textContent = detail.recommendation.reason;
      $("p", fields[1]).textContent = `30D movement ${detail.movement30d.display || "—"}`;
    }
    if (fields[2]) {
      $("strong", fields[2]).textContent = detail.recommendation.risk;
      $("p", fields[2]).textContent = `${formatCount(detail.supplierSummary.responseRiskCount)} supplier alerts open.`;
    }
  }

  if (bottomCards[0]) {
    $("tbody", bottomCards[0]).innerHTML = detail.quotes
      .map(
        (quote) => `
          <tr>
            <td><strong><a href="${escapeHtml(
              getWorkspacePageHref("suppliers.html", { supplierId: quote.supplier.id })
            )}">${escapeHtml(quote.supplier.name)}</a></strong></td>
            <td class="mono">${escapeHtml(quote.quote.display || "—")}</td>
            <td>${escapeHtml(quote.leadTimeDays ? `${quote.leadTimeDays}d` : "—")}</td>
            <td><span class="${quoteStatusBadgeClass(quote.status)}">${escapeHtml(
              titleCase(quote.status)
            )}</span></td>
          </tr>
        `
      )
      .join("");
  }

  if (bottomCards[1]) {
    $(".timeline-list", bottomCards[1]).innerHTML = detail.recentEvents
      .map(
        (event) => `
          <div class="timeline-item">
            <span>${escapeHtml(formatRelative(event.occurredAt))}</span>
            <p>${escapeHtml(event.label)}</p>
          </div>
        `
      )
      .join("");
  }

  if (bottomCards[2]) {
    $(".workflow-grid", bottomCards[2]).innerHTML = detail.followUpSteps
      .map(
        (step, index) => `
          <div class="workflow-step">
            <small>${String(index + 1).padStart(2, "0")}</small>
            <strong>${escapeHtml(step.split(".")[0])}</strong>
            <p>${escapeHtml(step)}</p>
          </div>
        `
      )
      .join("");
  }

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const query = searchInput?.value?.trim();
    if (!query) {
      return;
    }

    try {
      const nextSkuId = await resolveDefaultSkuId(query);
      if (!nextSkuId) {
        setPageStatus(`No SKU matched “${query}”.`, "warning");
        return;
      }

      window.location.assign(getWorkspacePageHref("sku-detail.html", { skuId: nextSkuId, search: query }));
    } catch (error) {
      setPageStatus(error.message || "Unable to search SKUs.", "error");
    }
  });

  setPageStatus(`Loaded ${detail.name} with ${formatCount(detail.quotes.length)} active quotes.`, "success");
}

async function initAlertsPage() {
  const searchInput = $("#alerts-search");
  const pageActions = $all(".page-actions a");
  const listCard = $(".list-card");
  const detailCard = $("#alert-detail-panel");
  const sidebarCard = $(".sidebar-card");
  const listHeadBadge = $(".list-head .badge", listCard);
  const alertList = $(".alert-list", listCard);

  let activeSearch = new URLSearchParams(window.location.search).get("search") || "";
  let selectedAlertId = new URLSearchParams(window.location.search).get("alertId");
  let alerts = [];
  let detailCache = new Map();
  let loadToken = 0;

  if (searchInput) {
    searchInput.value = activeSearch;
  }

  const renderDetail = async (alertId) => {
    if (!alertId) {
      return;
    }

    if (!detailCache.has(alertId)) {
      detailCache.set(alertId, requestData(`/alerts/${alertId}`));
    }

    const detail = await detailCache.get(alertId);
    const tone = $("#alert-detail-tone");
    const actionLinks = $all(".inline-actions a", detailCard);

    $("#alert-detail-title").textContent = detail.title;
    $("#alert-detail-summary").textContent = detail.summary;
    tone.textContent = titleCase(detail.severity);
    tone.className = severityBadgeClass(detail.severity);
    $("#alert-kpi-saving").textContent = detail.potentialSaving.display || "—";
    $("#alert-kpi-items").textContent = formatCount(detail.affectedItems);
    $("#alert-kpi-window").textContent = detail.windowLabel || "—";
    $("#alert-why-title").textContent = detail.whyTitle || "Why this matters";
    $("#alert-why-copy").textContent = detail.whyCopy || "No additional context provided.";
    $("#alert-move-title").textContent = detail.moveTitle || "No move suggested";
    $("#alert-move-copy").textContent = detail.moveCopy || "No next action available.";

    if (actionLinks[0]) {
      actionLinks[0].href = detail.sku
        ? getWorkspacePageHref("sku-detail.html", { skuId: detail.sku.id })
        : getWorkspacePageHref("watchlist.html");
      actionLinks[0].textContent = detail.sku ? "Open detail" : "Open watchlist";
    }

    if (actionLinks[1]) {
      actionLinks[1].href = detail.supplier
        ? getWorkspacePageHref("suppliers.html", { supplierId: detail.supplier.id })
        : getWorkspacePageHref("suppliers.html");
      actionLinks[1].textContent = detail.supplier ? "View supplier" : "Open suppliers";
    }

    if (actionLinks[2]) {
      if (detail.quotePackage?.id) {
        actionLinks[2].href = getWorkspacePageHref("quote-builder.html", {
          packageId: detail.quotePackage.id,
        });
        actionLinks[2].textContent = "Open pack";
      } else {
        actionLinks[2].href = getWorkspacePageHref("quote-builder.html", {
          fromAlertId: detail.id,
        });
        actionLinks[2].textContent = "Add to pack";
      }
    }

    if (pageActions[1]) {
      pageActions[1].href = actionLinks[2]?.href || getWorkspacePageHref("quote-builder.html");
    }

    if (sidebarCard) {
      const copy = $("p", sidebarCard);
      if (copy) {
        copy.textContent = `${detail.title}: ${detail.summary}`;
      }
    }
  };

  const renderList = () => {
    if (listHeadBadge) {
      listHeadBadge.textContent = `${formatCount(alerts.length)} open`;
    }

    alertList.innerHTML = alerts
      .map(
        (alert) => `
          <button
            type="button"
            class="alert-item${alert.id === selectedAlertId ? " active" : ""}"
            data-alert-id="${escapeHtml(alert.id)}"
            aria-pressed="${alert.id === selectedAlertId ? "true" : "false"}"
            aria-controls="alert-detail-panel"
          >
            <div class="alert-top">
              <h4>${escapeHtml(alert.title)}</h4>
              <span class="${severityBadgeClass(alert.severity)}">${escapeHtml(
                titleCase(alert.severity)
              )}</span>
            </div>
            <p class="list-meta">${escapeHtml(alert.summary)}</p>
          </button>
        `
      )
      .join("");

    updateNavPills({
      alerts: alerts.length,
    });
  };

  const load = async () => {
    const currentToken = ++loadToken;
    setPageStatus("Loading alerts…");

    const result = await requestEnvelope(
      `/alerts?${buildQuery({ pageSize: 100, status: "open", search: activeSearch || undefined })}`
    );
    if (currentToken !== loadToken) {
      return;
    }

    alerts = result.data || [];
    detailCache = new Map();

    if (!alerts.some((alert) => alert.id === selectedAlertId)) {
      selectedAlertId = alerts[0]?.id || null;
    }

    renderList();

    if (selectedAlertId) {
      updateSearchParam("alertId", selectedAlertId);
      await renderDetail(selectedAlertId);
    }

    setPageStatus(
      `Showing ${formatCount(alerts.length)} open alerts${activeSearch ? ` for “${activeSearch}”` : ""}.`,
      "success"
    );
  };

  alertList.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-alert-id]");
    if (!trigger) {
      return;
    }

    selectedAlertId = trigger.dataset.alertId;
    updateSearchParam("alertId", selectedAlertId);
    $all("[data-alert-id]", alertList).forEach((button) => {
      button.classList.toggle("active", button.dataset.alertId === selectedAlertId);
      button.setAttribute("aria-pressed", button.dataset.alertId === selectedAlertId ? "true" : "false");
    });

    try {
      await renderDetail(selectedAlertId);
    } catch (error) {
      setPageStatus(error.message || "Unable to load the alert detail.", "error");
    }
  });

  searchInput?.addEventListener(
    "input",
    debounce(() => {
      activeSearch = searchInput.value.trim();
      updateSearchParam("search", activeSearch || null);
      load().catch((error) => setPageStatus(error.message || "Unable to load alerts.", "error"));
    })
  );

  await load();
}

async function initSuppliersPage() {
  const searchInput = $("#supplier-search");
  const pageActions = $all(".page-actions a");
  const topbarChip = $(".workspace-topbar .chip");
  const supplierCards = $all(".supplier-grid .supplier-card");
  const bottomCards = $all(".card-grid-3 .table-card");
  const sidebarCard = $(".sidebar-card");

  let activeSearch = new URLSearchParams(window.location.search).get("search") || "";
  let selectedSupplierId = new URLSearchParams(window.location.search).get("supplierId");
  let suppliers = [];
  let detailCache = new Map();
  let loadToken = 0;

  if (searchInput) {
    searchInput.value = activeSearch;
  }

  const renderDetail = async (supplierId) => {
    if (!supplierId) {
      return;
    }

    if (!detailCache.has(supplierId)) {
      detailCache.set(supplierId, requestData(`/suppliers/${supplierId}`));
    }

    const detail = await detailCache.get(supplierId);
    const profileCard = supplierCards[0];
    const communicationCard = supplierCards[1];

    $(".supplier-head h3", profileCard).textContent = detail.name;
    $(".supplier-head .badge", profileCard).textContent = detail.tier || "Supplier";
    $(".supplier-head .badge", profileCard).className =
      detail.tier === "Preferred" ? "badge" : detail.tier === "Core" ? "badge amber" : "badge";
    const profileRows = [
      { label: "Score", value: `${detail.score} / 100` },
      { label: "Response SLA", value: detail.avgResponseLabel || "—" },
      { label: "Win rate", value: `${detail.winRatePercent}%` },
      { label: "Quote accuracy", value: detail.quoteAccuracyPercent ? `${detail.quoteAccuracyPercent}%` : "—" },
      { label: "Coverage", value: `${formatCount(detail.coverageCount)} categories` },
    ];

    $(".supplier-stack", profileCard).innerHTML = profileRows
      .map((row, index) =>
        index === 0
          ? `<div class="supplier-score"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(
              row.value
            )}</strong></div>`
          : `<div class="supplier-row"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(
              row.value
            )}</strong></div>`
      )
      .join("");

    $(".timeline-list", communicationCard).innerHTML = detail.communication
      .map(
        (item) => `
          <div class="timeline-item">
            <span>${escapeHtml(formatRelative(item.occurredAt))}</span>
            <p>${escapeHtml(item.label)}</p>
          </div>
        `
      )
      .join("");

    if (bottomCards[0]) {
      $("tbody", bottomCards[0]).innerHTML = detail.quoteHistory
        .map(
          (quote) => `
            <tr>
              <td><a href="${escapeHtml(
                getWorkspacePageHref("sku-detail.html", { skuId: quote.sku.id })
              )}">${escapeHtml(quote.sku.name)}</a></td>
              <td class="mono">${escapeHtml(quote.quote.display || "—")}</td>
              <td>${escapeHtml(quote.leadTimeDays ? `${quote.leadTimeDays}d` : "—")}</td>
              <td><span class="${quoteStatusBadgeClass(quote.result)}">${escapeHtml(
                titleCase(quote.result)
              )}</span></td>
            </tr>
          `
        )
        .join("");
    }

    if (bottomCards[1]) {
      const fields = $all(".field", bottomCards[1]);
      if (fields[0]) {
        $("strong", fields[0]).textContent = detail.risk.delivery;
        $("p", fields[0]).textContent = "Delivery and response health over recent quote requests.";
      }
      if (fields[1]) {
        $("strong", fields[1]).textContent = detail.risk.commercial;
        $("p", fields[1]).textContent = "Commercial stability and quote accuracy signal.";
      }
    }

    if (bottomCards[2]) {
      $(".workflow-grid", bottomCards[2]).innerHTML = detail.useCases
        .map(
          (useCase, index) => `
            <div class="workflow-step">
              <small>${String(index + 1).padStart(2, "0")}</small>
              <strong>${escapeHtml(useCase)}</strong>
              <p>${escapeHtml(useCase)}</p>
            </div>
          `
        )
        .join("");
    }

    if (sidebarCard) {
      const copy = $("p", sidebarCard);
      if (copy) {
        copy.textContent = `${detail.name}: ${detail.winRatePercent}% win rate, ${detail.avgResponseLabel || "—"} average response, ${detail.quoteAccuracyPercent || "—"}% quote accuracy.`;
      }
    }

    if (pageActions[1]) {
      pageActions[1].href = getWorkspacePageHref("quote-builder.html", {
        recipientSupplierIds: [detail.id],
      });
    }

    setPageStatus(
      `Showing ${detail.name}${activeSearch ? ` from ${formatCount(suppliers.length)} matched suppliers` : ""}.`,
      "success"
    );
  };

  const load = async () => {
    const currentToken = ++loadToken;
    setPageStatus("Loading suppliers…");

    const result = await requestEnvelope(
      `/suppliers?${buildQuery({ pageSize: 100, search: activeSearch || undefined })}`
    );
    if (currentToken !== loadToken) {
      return;
    }

    suppliers = result.data || [];
    detailCache = new Map();

    if (!suppliers.some((supplier) => supplier.id === selectedSupplierId)) {
      selectedSupplierId = suppliers[0]?.id || null;
    }

    if (topbarChip) {
      topbarChip.textContent = `${formatCount(result.meta?.total || suppliers.length)} suppliers`;
    }

    updateSearchParam("supplierId", selectedSupplierId || null);

    if (selectedSupplierId) {
      await renderDetail(selectedSupplierId);
    } else {
      setPageStatus("No supplier matched the current search.", "warning");
    }
  };

  searchInput?.addEventListener(
    "input",
    debounce(() => {
      activeSearch = searchInput.value.trim();
      updateSearchParam("search", activeSearch || null);
      load().catch((error) => setPageStatus(error.message || "Unable to load suppliers.", "error"));
    })
  );

  await load();
}

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSettingsPayload(draft) {
  return {
    movementThresholdPercent: Number(draft.movementThresholdPercent),
    quoteSpreadThresholdCny: Number(draft.quoteSpreadThresholdCny),
    responseSlaHours: Number(draft.responseSlaHours),
    channels: {
      inboxDelivery: Boolean(draft.channels.inboxDelivery),
      emailDigest: Boolean(draft.channels.emailDigest),
      slackWecomCritical: Boolean(draft.channels.slackWecomCritical),
    },
    approvalRules: draft.approvalRules.map((rule, index) => ({
      name: String(rule.name || `Rule ${index + 1}`).trim(),
      category: String(rule.category || "").trim() || null,
      minPackageAmount:
        rule.minPackageAmount === "" || rule.minPackageAmount == null ? null : Number(rule.minPackageAmount),
      requiredRole: String(rule.requiredRole || "approver"),
      stepOrder: Number(rule.stepOrder || index + 1),
      isActive: Boolean(rule.isActive),
    })),
  };
}

function settingsPayloadEquals(left, right) {
  return JSON.stringify(normalizeSettingsPayload(left)) === JSON.stringify(normalizeSettingsPayload(right));
}

async function initSettingsPage(session) {
  const saveButton = $("[data-settings-save]");
  const status = ensurePageStatus();
  const settingsGrids = $all(".settings-grid");
  const thresholdCard = settingsGrids[0]?.querySelectorAll(".rule-card")[0];
  const channelsCard = settingsGrids[0]?.querySelectorAll(".rule-card")[1];
  const approvalsCard = settingsGrids[1]?.querySelectorAll(".rule-card")[0];
  const governanceCard = settingsGrids[1]?.querySelectorAll(".rule-card")[1];
  const isAdmin = session.role === "admin";

  const initial = await requestData("/settings");
  let draft = cloneSettings(initial);

  const renderThresholds = () => {
    const stack = $(".field-stack", thresholdCard);
    stack.innerHTML = `
      <div class="field">
        <label for="movement-threshold">30D movement threshold (%)</label>
        <input id="movement-threshold" class="app-input" type="number" step="0.1" min="0" value="${escapeHtml(
          draft.movementThresholdPercent
        )}" data-settings-field="movementThresholdPercent" ${isAdmin ? "" : "disabled"} />
        <p>Trigger review when movement crosses this band.</p>
      </div>
      <div class="field">
        <label for="spread-threshold">Quote spread threshold (CNY)</label>
        <input id="spread-threshold" class="app-input" type="number" step="1" min="0" value="${escapeHtml(
          draft.quoteSpreadThresholdCny
        )}" data-settings-field="quoteSpreadThresholdCny" ${isAdmin ? "" : "disabled"} />
        <p>Only push alerts when the spread is commercially actionable.</p>
      </div>
      <div class="field">
        <label for="response-sla">Response SLA (hours)</label>
        <input id="response-sla" class="app-input" type="number" step="1" min="1" value="${escapeHtml(
          draft.responseSlaHours
        )}" data-settings-field="responseSlaHours" ${isAdmin ? "" : "disabled"} />
        <p>Escalate delayed suppliers once this deadline is missed.</p>
      </div>
    `;
  };

  const renderChannels = () => {
    const stack = $(".toggle-list", channelsCard);
    const channels = [
      {
        key: "inboxDelivery",
        title: "Inbox",
        copy: "Default workspace delivery.",
      },
      {
        key: "emailDigest",
        title: "Email digest",
        copy: "Daily summary at 17:30.",
      },
      {
        key: "slackWecomCritical",
        title: "Slack / WeCom",
        copy: "Only critical alerts.",
      },
    ];

    stack.innerHTML = channels
      .map(
        (channel) => `
          <div class="toggle-row">
            <div>
              <strong>${escapeHtml(channel.title)}</strong>
              <p>${escapeHtml(channel.copy)}</p>
            </div>
            <button
              class="toggle${draft.channels[channel.key] ? " on" : ""}"
              type="button"
              role="switch"
              aria-checked="${draft.channels[channel.key] ? "true" : "false"}"
              aria-label="Toggle ${escapeHtml(channel.title)}"
              data-channel-key="${escapeHtml(channel.key)}"
              ${isAdmin ? "" : "disabled"}
            ></button>
          </div>
        `
      )
      .join("");
  };

  const renderApprovals = () => {
    const stack = $(".field-stack", approvalsCard);
    stack.innerHTML = `
      <div class="inline-actions">
        <button class="secondary-btn" type="button" data-add-approval-rule ${isAdmin ? "" : "disabled"}>
          Add rule
        </button>
      </div>
      ${draft.approvalRules
        .map(
          (rule, index) => `
            <div class="field rule-editor" data-rule-index="${index}">
              <div class="form-grid">
                <label class="form-control">
                  <span>Rule name</span>
                  <input class="app-input" type="text" value="${escapeHtml(rule.name)}" data-rule-field="name" ${
                    isAdmin ? "" : "disabled"
                  } />
                </label>
                <label class="form-control">
                  <span>Category</span>
                  <input class="app-input" type="text" value="${escapeHtml(rule.category || "")}" data-rule-field="category" ${
                    isAdmin ? "" : "disabled"
                  } />
                </label>
                <label class="form-control">
                  <span>Min package amount</span>
                  <input class="app-input" type="number" step="1" min="0" value="${escapeHtml(
                    rule.minPackageAmount ?? ""
                  )}" data-rule-field="minPackageAmount" ${isAdmin ? "" : "disabled"} />
                </label>
                <label class="form-control">
                  <span>Required role</span>
                  <select class="app-select" data-rule-field="requiredRole" ${isAdmin ? "" : "disabled"}>
                    ${["approver", "finance_approver", "admin"]
                      .map(
                        (option) => `
                          <option value="${option}"${option === rule.requiredRole ? " selected" : ""}>
                            ${escapeHtml(titleCase(option))}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <label class="form-control">
                  <span>Step order</span>
                  <input class="app-input" type="number" step="1" min="1" value="${escapeHtml(
                    rule.stepOrder
                  )}" data-rule-field="stepOrder" ${isAdmin ? "" : "disabled"} />
                </label>
                <label class="form-control">
                  <span>Active</span>
                  <select class="app-select" data-rule-field="isActive" ${isAdmin ? "" : "disabled"}>
                    <option value="true"${rule.isActive ? " selected" : ""}>Active</option>
                    <option value="false"${rule.isActive ? "" : " selected"}>Paused</option>
                  </select>
                </label>
              </div>
              <div class="inline-actions inline-actions-row">
                <button class="secondary-btn" type="button" data-remove-approval-rule ${isAdmin ? "" : "disabled"}>
                  Remove
                </button>
              </div>
            </div>
          `
        )
        .join("")}
    `;
  };

  const renderGovernance = () => {
    const workflowGrid = $(".workflow-grid", governanceCard);
    workflowGrid.innerHTML = `
      <div class="workflow-step">
        <small>Workspace</small>
        <strong>${escapeHtml(state.session.workspace.name)}</strong>
        <p>${escapeHtml(state.session.workspace.timezone)} · ${escapeHtml(state.session.workspace.currency)}</p>
      </div>
      <div class="workflow-step">
        <small>Rules</small>
        <strong>${escapeHtml(String(draft.approvalRules.length))} active routes</strong>
        <p>Approval rules are evaluated in step-order sequence.</p>
      </div>
      <div class="workflow-step">
        <small>Access</small>
        <strong>${escapeHtml(isAdmin ? "Editable" : "Read only")}</strong>
        <p>${escapeHtml(
          isAdmin
            ? "You can update thresholds, channels, and routing rules."
            : "Only admins can save settings changes in this MVP."
        )}</p>
      </div>
    `;
  };

  const render = () => {
    renderThresholds();
    renderChannels();
    renderApprovals();
    renderGovernance();

    if (saveButton) {
      saveButton.disabled = !isAdmin || settingsPayloadEquals(initial, draft);
    }

    status.textContent = isAdmin
      ? saveButton?.disabled
        ? "No unsaved changes."
        : "Changes ready to save."
      : "Read-only view. Admin access is required to save workspace settings.";
    status.classList.remove("is-error", "is-success", "is-warning");
    if (!isAdmin) {
      status.classList.add("is-warning");
    }
  };

  const markDirty = () => {
    if (saveButton) {
      saveButton.disabled = !isAdmin || settingsPayloadEquals(initial, draft);
    }

    status.textContent = saveButton?.disabled ? "No unsaved changes." : "Changes ready to save.";
    status.classList.remove("is-error", "is-success", "is-warning");
  };

  render();

  thresholdCard.addEventListener("input", (event) => {
    const control = event.target.closest("[data-settings-field]");
    if (!control) {
      return;
    }

    const key = control.dataset.settingsField;
    draft[key] = control.value;
    markDirty();
  });

  channelsCard.addEventListener("click", (event) => {
    const button = event.target.closest("[data-channel-key]");
    if (!button || !isAdmin) {
      return;
    }

    const key = button.dataset.channelKey;
    draft.channels[key] = !draft.channels[key];
    renderChannels();
    markDirty();
  });

  approvalsCard.addEventListener("input", (event) => {
    const field = event.target.closest("[data-rule-field]");
    const ruleEditor = event.target.closest("[data-rule-index]");
    if (!field || !ruleEditor) {
      return;
    }

    const index = Number(ruleEditor.dataset.ruleIndex);
    const key = field.dataset.ruleField;
    const rule = draft.approvalRules[index];
    if (!rule) {
      return;
    }

    rule[key] = key === "isActive" ? field.value === "true" : field.value;
    markDirty();
  });

  approvalsCard.addEventListener("click", (event) => {
    if (!isAdmin) {
      return;
    }

    const addButton = event.target.closest("[data-add-approval-rule]");
    if (addButton) {
      draft.approvalRules.push({
        name: `Rule ${draft.approvalRules.length + 1}`,
        category: "",
        minPackageAmount: "",
        requiredRole: "approver",
        stepOrder: draft.approvalRules.length + 1,
        isActive: true,
      });
      renderApprovals();
      markDirty();
      return;
    }

    const removeButton = event.target.closest("[data-remove-approval-rule]");
    const ruleEditor = event.target.closest("[data-rule-index]");
    if (!removeButton || !ruleEditor) {
      return;
    }

    const index = Number(ruleEditor.dataset.ruleIndex);
    draft.approvalRules.splice(index, 1);
    renderApprovals();
    markDirty();
  });

  saveButton?.addEventListener("click", async () => {
    if (!isAdmin) {
      setPageStatus("Admin access is required to save settings.", "warning");
      return;
    }

    setPageStatus("Saving settings…");

    try {
      const payload = normalizeSettingsPayload(draft);
      const saved = await requestData("/settings", {
        method: "PATCH",
        body: payload,
      });

      Object.assign(initial, cloneSettings(saved));
      draft = cloneSettings(saved);
      render();
      setPageStatus("Settings saved and alerts re-reconciled.", "success");
    } catch (error) {
      setPageStatus(error.message || "Unable to save settings.", "error");
    }
  });
}

function canEditPackage(session, quotePackage) {
  return quotePackage?.status === "draft" && ["buyer", "admin"].includes(session.role);
}

function canApprovePackage(session, quotePackage) {
  if (quotePackage?.status !== "pending_approval") {
    return false;
  }

  const currentStep = quotePackage.approvals.find((approval) => approval.status === "pending");
  if (!currentStep) {
    return false;
  }

  return session.role === "admin" || session.role === currentStep.requiredRole;
}

function canDispatchPackage(session, quotePackage) {
  return quotePackage?.status === "approved" && ["buyer", "admin"].includes(session.role);
}

function getPackageDraft(quotePackage) {
  return {
    title: quotePackage.title || "",
    message: quotePackage.message || "",
    scheduleAt: quotePackage.scheduleAt || null,
    recipientSupplierIds: quotePackage.recipients.map((recipient) => recipient.id),
  };
}

function renderRecipientChoices(suppliers, selectedIds, disabled) {
  return suppliers
    .map(
      (supplier) => `
        <label class="choice-chip">
          <input type="checkbox" value="${escapeHtml(supplier.id)}" ${
            selectedIds.includes(supplier.id) ? "checked" : ""
          } ${disabled ? "disabled" : ""} />
          <span>
            <strong>${escapeHtml(supplier.name)}</strong>
            <small>${escapeHtml(`${supplier.score}/100 · ${supplier.tier || "Supplier"}`)}</small>
          </span>
        </label>
      `
    )
    .join("");
}

async function initQuoteBuilderPage(session) {
  const linesCard = $all(".builder-grid .builder-card")[0];
  const summaryCard = $all(".builder-grid .builder-card")[1];
  const workflowPanel = $(".panel");
  const pageHead = $(".page-head");
  const pageActions = $all(".page-actions a");
  const searchInput = $("#builder-search");
  const searchForm = $(".workspace-topbar .searchbar");
  const sidebarCard = $(".sidebar-card");
  const status = ensurePageStatus();

  let packageDetail = null;
  let draft = null;
  let suppliers = [];
  let sourceDescriptor = null;
  let packageId = new URLSearchParams(window.location.search).get("packageId");
  const fromAlertId = new URLSearchParams(window.location.search).get("fromAlertId");
  const fromSkuId = new URLSearchParams(window.location.search).get("fromSkuId");
  const preselectedRecipientIds = parseIdList(
    new URLSearchParams(window.location.search).get("recipientSupplierIds")
  );

  const loadSuppliers = async () => {
    const result = await requestEnvelope("/suppliers?pageSize=100&sort=score:desc");
    suppliers = result.data || [];
  };

  const createDraftFromSource = async () => {
    if (packageId || !["buyer", "admin"].includes(session.role)) {
      return;
    }

    const payload = {
      recipientSupplierIds: preselectedRecipientIds,
    };

    if (fromAlertId) {
      payload.fromAlertId = fromAlertId;
    }

    if (fromSkuId) {
      payload.fromSkuId = fromSkuId;
    }

    status.textContent = "Creating quote package draft…";
    packageDetail = await requestData("/quote-packages", {
      method: "POST",
      body: payload,
    });
    packageId = packageDetail.id;
    replaceSearchParams({
      packageId,
      fromAlertId: null,
      fromSkuId: null,
      recipientSupplierIds: null,
    });
  };

  const resolveContext = async () => {
    await loadSuppliers();

    if (packageId) {
      packageDetail = await requestData(`/quote-packages/${packageId}`);
    } else if (fromAlertId) {
      const alert = await requestData(`/alerts/${fromAlertId}`);
      sourceDescriptor = {
        title: alert.title,
        href: getWorkspacePageHref("alerts.html", { alertId: alert.id }),
      };

      if (alert.quotePackage?.id) {
        packageId = alert.quotePackage.id;
        replaceSearchParams({
          packageId,
          fromAlertId: null,
        });
        packageDetail = await requestData(`/quote-packages/${packageId}`);
      } else {
        await createDraftFromSource();
      }
    } else if (fromSkuId) {
      const sku = await requestData(`/skus/${fromSkuId}`);
      sourceDescriptor = {
        title: sku.name,
        href: getWorkspacePageHref("sku-detail.html", { skuId: sku.id }),
      };
      await createDraftFromSource();
    }

    if (packageId && !packageDetail) {
      packageDetail = await requestData(`/quote-packages/${packageId}`);
    }

    if (packageDetail) {
      draft = getPackageDraft(packageDetail);
      if (!draft.recipientSupplierIds.length && preselectedRecipientIds.length) {
        draft.recipientSupplierIds = preselectedRecipientIds;
      }
    }
  };

  const renderEmptyState = () => {
    if (pageHead) {
      $("h1", pageHead).textContent = "Assemble the next move.";
      $("p", pageHead).textContent =
        "Start from Alerts or SKU Detail to create a quote package tied to a real source line.";
    }

    if (pageActions[0]) {
      pageActions[0].href = getWorkspacePageHref("alerts.html");
    }

    if (pageActions[1]) {
      pageActions[1].href = getWorkspacePageHref("watchlist.html");
      pageActions[1].textContent = "Open watchlist";
    }

    linesCard.innerHTML = `
      <div class="builder-top">
        <div>
          <p class="eyebrow">Package lines</p>
          <h3>No package selected</h3>
        </div>
        <span class="badge amber">Needs source</span>
      </div>
      <div class="empty-state">
        <p>Use “Add to pack” from Alerts, SKU Detail, or Watchlist to create a draft package backed by the new API.</p>
      </div>
    `;

    summaryCard.innerHTML = `
      <div class="builder-top">
        <div>
          <p class="eyebrow">Summary</p>
          <h3>Next step</h3>
        </div>
      </div>
      <div class="field-stack">
        <div class="field">
          <label>Suggested entry points</label>
          <strong>Alerts for sourcing, SKU Detail for targeted negotiation, Watchlist for quick staging.</strong>
          <p>You can also open this page with a package id to review approvals and dispatch history.</p>
        </div>
      </div>
    `;

    workflowPanel.querySelector(".workflow-grid").innerHTML = `
      <div class="workflow-step"><small>01</small><strong>Select</strong><p>Choose an alert or SKU as the source line.</p></div>
      <div class="workflow-step"><small>02</small><strong>Review</strong><p>Pick recipients and confirm the message.</p></div>
      <div class="workflow-step"><small>03</small><strong>Send</strong><p>Submit, approve, and dispatch from the same screen.</p></div>
    `;

    if (sidebarCard) {
      const copy = $("p", sidebarCard);
      if (copy) {
        copy.textContent = "No quote package is active. Create one from a live alert or SKU to start the approval flow.";
      }
    }

    setPageStatus(
      ["buyer", "admin"].includes(session.role)
        ? "Open this page from a source line to create a live draft."
        : "Read-only view. Buyers and admins can create new quote packages.",
      "warning"
    );
  };

  const renderPackage = () => {
    const editable = canEditPackage(session, packageDetail);
    const approvable = canApprovePackage(session, packageDetail);
    const dispatchable = canDispatchPackage(session, packageDetail);
    const currentApproval = packageDetail.approvals.find((approval) => approval.status === "pending");
    const recipientIds = draft.recipientSupplierIds;

    if (pageHead) {
      $("h1", pageHead).textContent = packageDetail.title;
      $("p", pageHead).textContent = `${titleCase(packageDetail.status)} · ${
        packageDetail.totalAmount.display || "—"
      } total · ${packageDetail.estimatedSaving.display || "—"} estimated saving.`;
    }

    if (pageActions[0]) {
      pageActions[0].href = sourceDescriptor?.href || getWorkspacePageHref("alerts.html");
      pageActions[0].textContent = sourceDescriptor ? "Back to source" : "Back to alerts";
    }

    if (pageActions[1]) {
      pageActions[1].href = packageDetail.status === "dispatched"
        ? getWorkspacePageHref("suppliers.html")
        : getWorkspacePageHref("suppliers.html", {
            recipientSupplierIds: recipientIds,
          });
      pageActions[1].textContent = packageDetail.status === "dispatched" ? "Open suppliers" : "Review suppliers";
    }

    linesCard.innerHTML = `
      <div class="builder-top">
        <div>
          <p class="eyebrow">Package lines</p>
          <h3>${escapeHtml(packageDetail.title)}</h3>
        </div>
        <span class="${packageStatusBadgeClass(packageDetail.status)}">${escapeHtml(
          titleCase(packageDetail.status)
        )}</span>
      </div>
      <div class="builder-lines">
        ${packageDetail.lines
          .map(
            (line) => `
              <div class="builder-line">
                <span>${escapeHtml(line.sku.name)}</span>
                <strong>${escapeHtml(
                  `${line.supplier?.name || "No supplier"} / ${line.targetUnitPrice.display || line.currentBestQuote.display || "—"}`
                )}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="field-stack">
        <div class="field">
          <label for="package-title">Package title</label>
          <input id="package-title" class="app-input" type="text" value="${escapeHtml(
            draft.title
          )}" data-package-field="title" ${editable ? "" : "disabled"} />
          <p>Visible in approvals, audit, and dispatch history.</p>
        </div>
        <div class="field">
          <label for="package-message">Message to suppliers</label>
          <textarea id="package-message" class="app-textarea" rows="4" data-package-field="message" ${
            editable ? "" : "disabled"
          }>${escapeHtml(draft.message)}</textarea>
          <p>Kept with the package until it is dispatched.</p>
        </div>
        <div class="field">
          <label for="package-schedule">Scheduled dispatch</label>
          <input
            id="package-schedule"
            class="app-input"
            type="datetime-local"
            value="${escapeHtml(formatDateTimeInputValue(draft.scheduleAt))}"
            data-package-field="scheduleAt"
            ${editable ? "" : "disabled"}
          />
          <p>${escapeHtml(packageDetail.scheduleAt ? `Current value: ${formatDateTime(packageDetail.scheduleAt)}` : "Optional.")}</p>
        </div>
        <div class="field">
          <label>Recipients</label>
          <div class="choice-grid" data-recipient-grid>
            ${renderRecipientChoices(suppliers, recipientIds, !editable && !dispatchable)}
          </div>
          <p>${escapeHtml(
            editable
              ? "Select the suppliers that should receive the package."
              : "Recipient selection is locked unless the package is ready to dispatch."
          )}</p>
        </div>
      </div>
    `;

    summaryCard.innerHTML = `
      <div class="builder-top">
        <div>
          <p class="eyebrow">Summary</p>
          <h3>Current state</h3>
        </div>
        <span class="${packageStatusBadgeClass(packageDetail.status)}">${escapeHtml(
          titleCase(packageDetail.status)
        )}</span>
      </div>
      <div class="builder-total">
        <span>Estimated saving</span>
        <strong>${escapeHtml(packageDetail.estimatedSaving.display || "—")}</strong>
      </div>
      <div class="field-stack">
        <div class="field">
          <label>Total package amount</label>
          <strong>${escapeHtml(packageDetail.totalAmount.display || "—")}</strong>
          <p>${escapeHtml(`${packageDetail.lines.length} line(s) in the package.`)}</p>
        </div>
        <div class="field">
          <label>Recipients</label>
          <strong>${escapeHtml(`${recipientIds.length} recipient(s)`)} </strong>
          <p>${escapeHtml(
            recipientIds.length
              ? suppliers
                  .filter((supplier) => recipientIds.includes(supplier.id))
                  .map((supplier) => supplier.name)
                  .join(", ")
              : "No recipients selected yet."
          )}</p>
        </div>
        <div class="field">
          <label>Approval</label>
          <strong>${escapeHtml(
            packageDetail.approvals.length
              ? `${packageDetail.approvals.filter((approval) => approval.status === "approved").length}/${packageDetail.approvals.length} completed`
              : "No approvals yet"
          )}</strong>
          <p>${escapeHtml(
            currentApproval
              ? `Current step: ${currentApproval.label} (${titleCase(currentApproval.requiredRole)})`
              : packageDetail.status === "approved"
                ? "All approvals completed."
                : "Submit the draft to generate approval steps."
          )}</p>
        </div>
        <div class="field">
          <label>Dispatch history</label>
          <strong>${escapeHtml(`${packageDetail.dispatches.length} dispatch record(s)`)}</strong>
          <p>${escapeHtml(
            packageDetail.dispatches[0]
              ? `Last recorded ${formatDateTime(packageDetail.dispatches[0].recordedAt)}.`
              : "No dispatch has been recorded yet."
          )}</p>
        </div>
      </div>
      <div class="inline-actions inline-actions-row">
        ${editable ? '<button class="secondary-btn" type="button" data-package-save>Save draft</button>' : ""}
        ${editable ? '<button class="primary-btn" type="button" data-package-submit>Submit for approval</button>' : ""}
        ${approvable ? '<button class="secondary-btn" type="button" data-package-reject>Reject</button>' : ""}
        ${approvable ? '<button class="primary-btn" type="button" data-package-approve>Approve</button>' : ""}
        ${dispatchable ? '<button class="primary-btn" type="button" data-package-dispatch>Dispatch</button>' : ""}
        <button class="secondary-btn" type="button" data-package-refresh>Refresh</button>
      </div>
    `;

    const workflowGrid = $(".workflow-grid", workflowPanel);
    workflowGrid.innerHTML = packageDetail.approvals.length
      ? packageDetail.approvals
          .map(
            (approval) => `
              <div class="workflow-step">
                <small>Step ${escapeHtml(approval.stepOrder)}</small>
                <strong>${escapeHtml(approval.label)}</strong>
                <p>${escapeHtml(
                  `${titleCase(approval.status)} · ${titleCase(approval.requiredRole)}${
                    approval.assignedUser ? ` · ${approval.assignedUser.name}` : ""
                  }`
                )}</p>
              </div>
            `
          )
          .join("")
      : `
          <div class="workflow-step"><small>01</small><strong>Select</strong><p>The source line is already staged in this draft.</p></div>
          <div class="workflow-step"><small>02</small><strong>Review</strong><p>Save title, message, schedule, and recipients.</p></div>
          <div class="workflow-step"><small>03</small><strong>Send</strong><p>Submit to route approvals and dispatch.</p></div>
        `;

    if (sidebarCard) {
      const copy = $("p", sidebarCard);
      if (copy) {
        copy.textContent = `${packageDetail.lines.length} line(s), ${recipientIds.length} recipient(s), status ${titleCase(
          packageDetail.status
        )}.`;
      }
    }

    if (searchInput) {
      searchInput.placeholder = `${packageDetail.lines[0]?.sku.name || "Search staged item or supplier"}`;
    }
  };

  const bindEditor = () => {
    if (!packageDetail) {
      return;
    }

    const editable = canEditPackage(session, packageDetail);
    const titleInput = $("[data-package-field='title']", linesCard);
    const messageInput = $("[data-package-field='message']", linesCard);
    const scheduleInput = $("[data-package-field='scheduleAt']", linesCard);
    const recipientGrid = $("[data-recipient-grid]", linesCard);
    const saveButton = $("[data-package-save]", summaryCard);
    const submitButton = $("[data-package-submit]", summaryCard);
    const approveButton = $("[data-package-approve]", summaryCard);
    const rejectButton = $("[data-package-reject]", summaryCard);
    const dispatchButton = $("[data-package-dispatch]", summaryCard);
    const refreshButton = $("[data-package-refresh]", summaryCard);

    const syncDraft = () => {
      draft.title = titleInput?.value?.trim() || packageDetail.title;
      draft.message = messageInput?.value?.trim() || "";
      draft.scheduleAt = toIsoDateTime(scheduleInput?.value) || null;
      draft.recipientSupplierIds = $all("input[type='checkbox']", recipientGrid)
        .filter((input) => input.checked)
        .map((input) => input.value);

      if (editable) {
        setPageStatus("Draft has local changes.", "warning");
      }
    };

    const saveDraft = async () => {
      syncDraft();
      setPageStatus("Saving draft…");

      packageDetail = await requestData(`/quote-packages/${packageDetail.id}`, {
        method: "PATCH",
        body: {
          title: draft.title,
          message: draft.message,
          scheduleAt: draft.scheduleAt,
          recipientSupplierIds: draft.recipientSupplierIds,
        },
      });
      draft = getPackageDraft(packageDetail);
      renderPackage();
      bindEditor();
    };

    titleInput?.addEventListener("input", syncDraft);
    messageInput?.addEventListener("input", syncDraft);
    scheduleInput?.addEventListener("input", syncDraft);
    recipientGrid?.addEventListener("change", syncDraft);

    saveButton?.addEventListener("click", async () => {
      try {
        await saveDraft();
        setPageStatus("Draft saved.", "success");
      } catch (error) {
        setPageStatus(error.message || "Unable to save the draft.", "error");
      }
    });

    submitButton?.addEventListener("click", async () => {
      try {
        if (saveButton) {
          await saveDraft();
        }
      } catch (error) {
        setPageStatus(error.message || "Unable to save the draft.", "error");
        return;
      }

      setPageStatus("Submitting package…");

      try {
        packageDetail = await requestData(`/quote-packages/${packageDetail.id}/submit`, {
          method: "POST",
        });
        draft = getPackageDraft(packageDetail);
        renderPackage();
        bindEditor();
        setPageStatus("Package submitted for approval.", "success");
      } catch (error) {
        setPageStatus(error.message || "Unable to submit the package.", "error");
      }
    });

    approveButton?.addEventListener("click", async () => {
      const currentApproval = packageDetail.approvals.find((approval) => approval.status === "pending");
      if (!currentApproval) {
        return;
      }

      const comment = window.prompt("Approval comment (optional):", "Ready for dispatch.") || "";
      setPageStatus("Recording approval…");

      try {
        packageDetail = await requestData(
          `/quote-packages/${packageDetail.id}/approvals/${currentApproval.id}/decision`,
          {
            method: "POST",
            body: {
              decision: "approved",
              comment,
            },
          }
        );
        draft = getPackageDraft(packageDetail);
        renderPackage();
        bindEditor();
        setPageStatus("Approval recorded.", "success");
      } catch (error) {
        setPageStatus(error.message || "Unable to approve the package.", "error");
      }
    });

    rejectButton?.addEventListener("click", async () => {
      const currentApproval = packageDetail.approvals.find((approval) => approval.status === "pending");
      if (!currentApproval) {
        return;
      }

      const comment = window.prompt("Rejection comment:", "Need another pricing pass.");
      if (comment == null) {
        return;
      }

      setPageStatus("Recording rejection…");

      try {
        packageDetail = await requestData(
          `/quote-packages/${packageDetail.id}/approvals/${currentApproval.id}/decision`,
          {
            method: "POST",
            body: {
              decision: "rejected",
              comment,
            },
          }
        );
        draft = getPackageDraft(packageDetail);
        renderPackage();
        bindEditor();
        setPageStatus("Rejection recorded.", "success");
      } catch (error) {
        setPageStatus(error.message || "Unable to reject the package.", "error");
      }
    });

    dispatchButton?.addEventListener("click", async () => {
      syncDraft();
      const notes = window.prompt("Dispatch notes (optional):", "Recorded as sent to suppliers.") || "";
      setPageStatus("Dispatching package…");

      try {
        packageDetail = await requestData(`/quote-packages/${packageDetail.id}/dispatch`, {
          method: "POST",
          body: {
            recipientSupplierIds: draft.recipientSupplierIds,
            scheduledAt: draft.scheduleAt,
            notes,
          },
        });
        draft = getPackageDraft(packageDetail);
        renderPackage();
        bindEditor();
        setPageStatus("Dispatch recorded.", "success");
      } catch (error) {
        setPageStatus(error.message || "Unable to dispatch the package.", "error");
      }
    });

    refreshButton?.addEventListener("click", async () => {
      setPageStatus("Refreshing package…");
      try {
        packageDetail = await requestData(`/quote-packages/${packageDetail.id}`);
        draft = getPackageDraft(packageDetail);
        renderPackage();
        bindEditor();
        setPageStatus("Package refreshed.", "success");
      } catch (error) {
        setPageStatus(error.message || "Unable to refresh the package.", "error");
      }
    });

    if (searchForm && !searchForm.dataset.bound) {
      searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
      });
      searchForm.dataset.bound = "true";
    }

    if (searchInput && !searchInput.dataset.bound) {
      searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim().toLowerCase();
        $all(".builder-line", linesCard).forEach((line) => {
          const matches = !query || line.textContent.toLowerCase().includes(query);
          line.hidden = !matches;
          line.classList.toggle("search-hidden", !matches);
        });
        $all(".choice-chip", linesCard).forEach((choice) => {
          const matches = !query || choice.textContent.toLowerCase().includes(query);
          choice.hidden = !matches;
          choice.classList.toggle("search-hidden", !matches);
        });
      });
      searchInput.dataset.bound = "true";
    }
  };

  await resolveContext();

  if (!packageDetail) {
    renderEmptyState();
    return;
  }

  renderPackage();
  bindEditor();
  setPageStatus(`Loaded package ${packageDetail.title}.`, "success");
}

function updateNavPills(counts) {
  const navLinks = $all(".nav-link");

  navLinks.forEach((link) => {
    const label = link.textContent.toLowerCase();

    if (label.includes("watchlist") && counts.watchlist != null) {
      let pill = $(".nav-pill", link);
      if (!pill) {
        pill = document.createElement("span");
        pill.className = "nav-pill";
        link.appendChild(pill);
      }
      pill.textContent = formatCount(counts.watchlist);
    }

    if (label.includes("alerts") && counts.alerts != null) {
      let pill = $(".nav-pill", link);
      if (!pill) {
        pill = document.createElement("span");
        pill.className = "nav-pill";
        link.appendChild(pill);
      }
      pill.textContent = formatCount(counts.alerts);
    }
  });
}

function initSortableTables() {
  const sortableTables = document.querySelectorAll(".table[data-sortable]");

  sortableTables.forEach((table) => {
    const headers = Array.from(table.querySelectorAll("thead th"));
    const body = table.querySelector("tbody");

    if (!body) {
      return;
    }

    headers.forEach((header, index) => {
      if ($(".table-sort", header)) {
        return;
      }

      const label = header.textContent.trim();
      const button = document.createElement("button");
      button.type = "button";
      button.className = "table-sort";
      button.textContent = label;
      button.setAttribute("aria-label", `Sort by ${label}`);
      header.textContent = "";
      header.appendChild(button);

      button.addEventListener("click", () => {
        const currentSort = header.getAttribute("aria-sort");
        const direction = currentSort === "ascending" ? "descending" : "ascending";
        const rows = Array.from(body.querySelectorAll("tr"));

        headers.forEach((cell) => {
          cell.removeAttribute("aria-sort");
        });

        header.setAttribute("aria-sort", direction);

        rows
          .sort((leftRow, rightRow) => {
            const leftCell = leftRow.children[index];
            const rightCell = rightRow.children[index];
            const leftValue = getSortableValue(leftCell);
            const rightValue = getSortableValue(rightCell);

            if (leftValue < rightValue) {
              return direction === "ascending" ? -1 : 1;
            }

            if (leftValue > rightValue) {
              return direction === "ascending" ? 1 : -1;
            }

            return 0;
          })
          .forEach((row) => body.appendChild(row));
      });
    });
  });
}

function getSortableValue(cell) {
  const text = cell.textContent.trim().replace(/\s+/g, " ");
  const numeric = Number.parseFloat(text.replace(/[^\d.-]/g, ""));

  if (!Number.isNaN(numeric) && /\d/.test(text)) {
    return numeric;
  }

  return text.toLowerCase();
}

function initRevealMotion() {
  if (prefersReducedMotion.matches || typeof IntersectionObserver === "undefined") {
    document.querySelectorAll("[data-reveal]").forEach((node) => {
      node.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
    }
  );

  document.querySelectorAll("[data-reveal]").forEach((node) => {
    observer.observe(node);
  });
}
