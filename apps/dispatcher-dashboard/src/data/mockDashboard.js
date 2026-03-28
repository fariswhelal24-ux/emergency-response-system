export const mockStats = {
    activeCases: 4,
    ambulancesAvailable: 12,
    volunteersAvailable: 26,
    highPriorityIncidents: 2
};
export const mockCases = [
    {
        id: "11111111-1111-1111-1111-111111111111",
        caseNumber: "CASE-20260323-0007",
        emergencyType: "Severe breathing difficulty",
        priority: "CRITICAL",
        status: "AMBULANCE_ASSIGNED",
        address: "Al-Irsal Street, Ramallah",
        location: { latitude: 31.9038, longitude: 35.2034 },
        createdAt: new Date().toISOString(),
        reportingUserId: "u-1"
    },
    {
        id: "22222222-2222-2222-2222-222222222222",
        caseNumber: "CASE-20260323-0008",
        emergencyType: "Road collision",
        priority: "HIGH",
        status: "VOLUNTEERS_NOTIFIED",
        address: "Jerusalem Road Junction",
        location: { latitude: 31.8993, longitude: 35.2162 },
        createdAt: new Date().toISOString(),
        reportingUserId: "u-2"
    }
];
export const mockCaseDetail = {
    case: {
        id: mockCases[0].id,
        caseNumber: mockCases[0].caseNumber,
        emergencyType: mockCases[0].emergencyType,
        priority: mockCases[0].priority,
        status: mockCases[0].status,
        voiceDescription: "Patient struggling to breathe and speaking in short phrases.",
        transcriptionText: "He cannot breathe well and looks very weak.",
        aiAnalysis: "Likely acute respiratory distress requiring urgent oxygen support.",
        possibleCondition: "Acute asthma exacerbation",
        riskLevel: "High",
        address: mockCases[0].address,
        location: mockCases[0].location,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        closedAt: null,
        patient: {
            userId: "u-1",
            name: "Sami Darwish",
            phone: "+970-598-222-111",
            bloodType: "O+",
            conditions: "Asthma, hypertension",
            allergies: "Penicillin"
        }
    },
    timeline: [
        {
            id: "t-1",
            updateType: "CASE_CREATED",
            message: "Emergency request received",
            createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
            authorUserId: "u-1"
        },
        {
            id: "t-2",
            updateType: "AMBULANCE_ASSIGNED",
            message: "Ambulance unit AMB-101 assigned",
            createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            authorUserId: "d-1"
        }
    ],
    assignments: {
        volunteers: [
            {
                assignmentId: "v-1",
                volunteerId: "vol-1",
                name: "Dr. Layla Haddad",
                specialty: "Emergency Physician",
                status: "ACCEPTED",
                etaMinutes: 2,
                distanceKm: 1.2,
                assignedAt: new Date().toISOString()
            }
        ],
        ambulances: [
            {
                assignmentId: "a-1",
                ambulanceId: "amb-101",
                unitCode: "AMB-101",
                supportLevel: "ALS",
                status: "ASSIGNED",
                etaMinutes: 3,
                distanceKm: 2.3,
                assignedAt: new Date().toISOString()
            }
        ]
    },
    nearby: {
        volunteers: [
            {
                volunteerId: "vol-2",
                userId: "user-vol-2",
                name: "Nour Saleh",
                specialty: "Emergency Nurse",
                availability: "AVAILABLE",
                distanceKm: 2.6
            }
        ],
        ambulances: [
            {
                id: "amb-204",
                unitCode: "AMB-204",
                supportLevel: "BLS",
                status: "AVAILABLE",
                crewCount: 2,
                distanceKm: 3.1
            }
        ]
    }
};
export const mockReports = [
    { date: "2026-03-23", caseCount: 19, avgTotalResponseSeconds: 428, volunteerContributions: 14 },
    { date: "2026-03-22", caseCount: 17, avgTotalResponseSeconds: 452, volunteerContributions: 13 },
    { date: "2026-03-21", caseCount: 21, avgTotalResponseSeconds: 439, volunteerContributions: 16 }
];
