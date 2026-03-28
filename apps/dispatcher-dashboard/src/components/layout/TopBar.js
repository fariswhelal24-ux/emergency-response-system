import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const TopBar = ({ activeCaseNumber, refreshedAt }) => {
    return (_jsxs("header", { className: "topbar", children: [_jsxs("div", { children: [_jsx("p", { className: "topbar__eyebrow", children: "Operations Control Room" }), _jsx("h1", { className: "topbar__title", children: "Emergency Response Command Dashboard" })] }), _jsxs("div", { className: "topbar__meta", children: [_jsx("span", { className: "chip chip--live", children: "Live Sync" }), activeCaseNumber ? _jsxs("span", { className: "chip", children: ["Focused: ", activeCaseNumber] }) : null, _jsxs("span", { className: "chip", children: ["Updated ", refreshedAt] })] })] }));
};
