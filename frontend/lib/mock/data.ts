// Demo data the fake backend serves. Delete this folder when the real backend is ready.
// The real source is backend/data/profiles.json and GET /roles.

import type { Persona } from "../personas";
import type { RolesDto } from "../types";

export const ROLES: RolesDto = {
  food: { label: "Food delivery", minTenure: 24, minPeriods: 100, maxMissed: 0, minIncome: 18000, reader: "Next platform, landlord, small-loan lender" },
  cab: { label: "Cab or auto driver", minTenure: 24, minPeriods: 100, maxMissed: 0, minIncome: 25000, reader: "Vehicle financier, insurer" },
  home: { label: "Home services", minTenure: 12, minPeriods: 40, maxMissed: 2, minIncome: 20000, reader: "Skill-loan lender, tool financier" },
  goods: { label: "Goods or courier driver", minTenure: 18, minPeriods: 70, maxMissed: 0, minIncome: 30000, reader: "Commercial vehicle financier, fleet owner" },
};

export const PERSONAS: Persona[] = [
  { id: 1, name: "Ramesh Kumar", nameKn: "ರಮೇಶ್ ಕುಮಾರ್", role: "food", platforms: ["Swiggy"], city: "Bengaluru", maskedAccount: "XXXX1234", aadhaarLast4: "4821", expected: "Strong", why: "The hero story, 156 weekly credits" },
  { id: 2, name: "Suresh Gowda", nameKn: "ಸುರೇಶ್ ಗೌಡ", role: "cab", platforms: ["Uber", "Ola"], city: "Mysuru", maskedAccount: "XXXX5568", aadhaarLast4: "7305", expected: "Strong", why: "Works beyond delivery" },
  { id: 3, name: "Imran Pasha", nameKn: "ಇಮ್ರಾನ್ ಪಾಷಾ", role: "cab", platforms: ["Uber"], city: "Bengaluru", maskedAccount: "XXXX9021", aadhaarLast4: "1190", expected: "Strong", why: "High income with high stability" },
  { id: 4, name: "Manjunath S", nameKn: "ಮಂಜುನಾಥ್ ಎಸ್", role: "home", platforms: ["Urban Company"], city: "Hubballi", maskedAccount: "XXXX3347", aadhaarLast4: "6643", expected: "Good", why: "8 months tenure, solid performance" },
  { id: 5, name: "Venkatesh R", nameKn: "ವೆಂಕಟೇಶ್ ಆರ್", role: "goods", platforms: ["Porter"], city: "Tumakuru", maskedAccount: "XXXX7710", aadhaarLast4: "2058", expected: "Strong", why: "Different payout rhythm, same proof" },
  { id: 6, name: "Farhan Ali", nameKn: "ಫರ್ಹಾನ್ ಅಲಿ", role: "food", platforms: ["Swiggy", "Zomato"], city: "Bengaluru", maskedAccount: "XXXX4482", aadhaarLast4: "9937", expected: "Strong", why: "Two platforms, one passport" },
  { id: 7, name: "Anand Verma", nameKn: "ಆನಂದ್ ವರ್ಮಾ", role: "food", platforms: ["Zomato"], city: "Bengaluru", maskedAccount: "XXXX8821", aadhaarLast4: "5512", expected: "Weak", why: "New worker with limited work history (Band Weak)" },
];

