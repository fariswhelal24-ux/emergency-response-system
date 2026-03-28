import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
const etaFromDistance = (distanceKm) => Math.max(2, Math.ceil(distanceKm * 2.2));
export const AmbulanceAssignmentPage = ({ detail, onAssign }) => {
    const [showAvailableOnly, setShowAvailableOnly] = useState(true);
    const [showAdvancedSupportOnly, setShowAdvancedSupportOnly] = useState(false);
    const rows = useMemo(() => {
        return (detail?.nearby.ambulances ?? []).filter((item) => {
            if (showAvailableOnly && item.status !== "AVAILABLE") {
                return false;
            }
            if (showAdvancedSupportOnly && item.supportLevel !== "ALS") {
                return false;
            }
            return true;
        });
    }, [detail?.nearby.ambulances, showAvailableOnly, showAdvancedSupportOnly]);
    if (!detail) {
        return _jsx("div", { className: "empty-state", children: "Select a case first." });
    }
    return (_jsxs("article", { className: "panel", children: [_jsx("header", { className: "panel__header", children: _jsx("h3", { children: "Ambulance Assignment" }) }), _jsxs("div", { className: "button-row", children: [_jsx("button", { onClick: () => setShowAvailableOnly((current) => !current), children: showAvailableOnly ? "Showing: Available only" : "Showing: All units" }), _jsx("button", { onClick: () => setShowAdvancedSupportOnly((current) => !current), children: showAdvancedSupportOnly ? "Showing: ALS only" : "Showing: Any support" })] }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Unit ID" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Distance" }), _jsx("th", { children: "ETA" }), _jsx("th", { children: "Crew" }), _jsx("th", { children: "Support" }), _jsx("th", { children: "Action" })] }) }), _jsx("tbody", { children: rows.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.unitCode }), _jsx("td", { children: item.status }), _jsxs("td", { children: [item.distanceKm.toFixed(1), " km"] }), _jsxs("td", { children: [etaFromDistance(item.distanceKm), " min"] }), _jsx("td", { children: item.crewCount }), _jsx("td", { children: item.supportLevel }), _jsx("td", { children: _jsx("button", { onClick: () => onAssign(item.id), children: "Assign" }) })] }, item.id))) })] }) })] }));
};
