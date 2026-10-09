pragma circom 2.2.3;
include "income-activity-core.circom";
// Predicate-only local harness: lacks a snapshot commitment and authorization.
component main {public [incomeEnabled, incomeWindowMonths, minAverageIncomePaise,
    activityEnabled, activityIsWeekly, activityWindow, minActivePeriods]} = IncomeActivity();
