import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const items = [
    { key: "overview", label: "Emergency Dashboard" },
    { key: "caseDetails", label: "Case Details" },
    { key: "ambulanceAssignment", label: "Ambulance Assignment" },
    { key: "volunteerCoordination", label: "Volunteer Coordination" },
    { key: "liveTracking", label: "Live Tracking" },
    { key: "reports", label: "Incident Closure & Reports" }
];
export const Sidebar = ({ activeView, onChange }) => {
    return (_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "brand", children: [_jsx("div", { className: "brand__logo", children: "ER" }), _jsxs("div", { children: [_jsx("p", { className: "brand__eyebrow", children: "Dispatch Center" }), _jsx("h2", { className: "brand__title", children: "Real-Time Emergency Ops" })] })] }), _jsx("nav", { className: "sidebar__nav", children: items.map((item) => {
                    const active = item.key === activeView;
                    return (_jsx("button", { type: "button", className: `nav-item ${active ? "nav-item--active" : ""}`, onClick: () => onChange(item.key), children: item.label }, item.key));
                }) })] }));
};
