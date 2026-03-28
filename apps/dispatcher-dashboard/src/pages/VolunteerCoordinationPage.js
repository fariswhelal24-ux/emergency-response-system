import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
const etaFromDistance = (distanceKm) => Math.max(2, Math.ceil(distanceKm * 2.4));
export const VolunteerCoordinationPage = ({ detail, onNotify }) => {
    const assignmentStatusByVolunteer = useMemo(() => {
        const index = new Map();
        (detail?.assignments.volunteers ?? []).forEach((assignment) => {
            index.set(assignment.volunteerId, assignment.status);
        });
        return index;
    }, [detail?.assignments.volunteers]);
    if (!detail) {
        return _jsx("div", { className: "empty-state", children: "Select a case first." });
    }
    return (_jsxs("article", { className: "panel", children: [_jsx("header", { className: "panel__header", children: _jsx("h3", { children: "Volunteer Coordination" }) }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Specialty" }), _jsx("th", { children: "Availability" }), _jsx("th", { children: "Distance" }), _jsx("th", { children: "ETA" }), _jsx("th", { children: "Response" }), _jsx("th", { children: "Action" })] }) }), _jsx("tbody", { children: detail.nearby.volunteers.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.name }), _jsx("td", { children: item.specialty }), _jsx("td", { children: item.availability }), _jsxs("td", { children: [item.distanceKm.toFixed(1), " km"] }), _jsxs("td", { children: [etaFromDistance(item.distanceKm), " min"] }), _jsx("td", { children: assignmentStatusByVolunteer.get(item.volunteerId) ?? "PENDING" }), _jsx("td", { children: _jsxs("div", { className: "button-row", children: [_jsx("button", { onClick: () => onNotify(item.volunteerId), children: "Notify" }), _jsx("button", { children: "Call" }), _jsx("button", { children: "Message" }), _jsx("button", { children: "Mark Assigned" })] }) })] }, item.volunteerId))) })] }) })] }));
};
