import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const MetricCard = ({ label, value, tone }) => {
    return (_jsxs("article", { className: `metric-card metric-card--${tone ?? "default"}`, children: [_jsx("p", { children: label }), _jsx("h3", { children: value })] }));
};
