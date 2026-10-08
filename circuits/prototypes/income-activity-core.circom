pragma circom 2.2.3;
include "circomlib/circuits/comparators.circom";

// Isolated Backend B prototype: LOCKED predicate semantics, PROPOSED uint64
// bounds/disabled-zero encoding/unit mapping. Not a shared policy wire freeze.
// No sums or activity counts are outputs. Valid FAIL is a valid witness.
template IncomeActivity() {
    signal input monthlyGigIncomeTotals[36];
    signal input weeklyActivity[156];
    signal input monthlyActivity[36];
    signal input incomeEnabled;
    signal input incomeWindowMonths;
    signal input minAverageIncomePaise;
    signal input activityEnabled;
    signal input activityIsWeekly; // prototype: 0=MONTH, 1=WEEK
    signal input activityWindow;
    signal input minActivePeriods;
    signal output incomePass;
    signal output activityPass;

    incomeEnabled * (incomeEnabled-1) === 0;
    activityEnabled * (activityEnabled-1) === 0;
    activityIsWeekly * (activityIsWeekly-1) === 0;
    component incomeWindowBits = Num2Bits(6);
    incomeWindowBits.in <== incomeWindowMonths;
    component incomeWindowLimit = LessEqThan(6);
    incomeWindowLimit.in[0] <== incomeWindowMonths;
    incomeWindowLimit.in[1] <== 36;
    incomeWindowLimit.out === 1;
    component incomeWindowZero = IsZero();
    incomeWindowZero.in <== incomeWindowMonths;
    incomeEnabled * incomeWindowZero.out === 0;
    (1-incomeEnabled) * incomeWindowMonths === 0;
    (1-incomeEnabled) * minAverageIncomePaise === 0;
    component thresholdBits = Num2Bits(64);
    thresholdBits.in <== minAverageIncomePaise;

    component amountBits[36];
    component incomeSelect[36];
    signal incomeTerm[36];
    signal incomeSum[37];
    incomeSum[0] <== 0;
    for (var i=0; i<36; i++) {
        amountBits[i] = Num2Bits(64);
        amountBits[i].in <== monthlyGigIncomeTotals[i];
        incomeSelect[i] = LessThan(6);
        incomeSelect[i].in[0] <== 35-i;
        incomeSelect[i].in[1] <== incomeWindowMonths;
        incomeTerm[i] <== incomeSelect[i].out * monthlyGigIncomeTotals[i];
        incomeSum[i+1] <== incomeSum[i] + incomeTerm[i];
    }
    signal thresholdProduct;
    thresholdProduct <== minAverageIncomePaise * incomeWindowMonths;
    // Both sides < 36*2^64 < 2^70, far below BN254. Never divide/round.
    component sumBits = Num2Bits(70);
    sumBits.in <== incomeSum[36];
    component productBits = Num2Bits(70);
    productBits.in <== thresholdProduct;
    component incomeBelow = LessThan(70);
    incomeBelow.in[0] <== incomeSum[36];
    incomeBelow.in[1] <== thresholdProduct;
    incomePass <== 1-incomeEnabled*incomeBelow.out;

    component activityWindowBits = Num2Bits(8);
    activityWindowBits.in <== activityWindow;
    component minActiveBits = Num2Bits(8);
    minActiveBits.in <== minActivePeriods;
    component activityWindowLimit = LessEqThan(8);
    activityWindowLimit.in[0] <== activityWindow;
    activityWindowLimit.in[1] <== 36+120*activityIsWeekly;
    activityWindowLimit.out === 1;
    component activityWindowZero = IsZero();
    activityWindowZero.in <== activityWindow;
    activityEnabled * activityWindowZero.out === 0;
    component minActiveLimit = LessEqThan(8);
    minActiveLimit.in[0] <== minActivePeriods;
    minActiveLimit.in[1] <== activityWindow;
    minActiveLimit.out === 1;
    (1-activityEnabled) * activityWindow === 0;
    (1-activityEnabled) * minActivePeriods === 0;
    (1-activityEnabled) * activityIsWeekly === 0;

    component monthSelect[36];
    signal monthTerm[36];
    signal monthCount[37];
    monthCount[0] <== 0;
    for (var m=0; m<36; m++) {
        monthlyActivity[m] * (monthlyActivity[m]-1) === 0;
        monthSelect[m] = LessThan(8);
        monthSelect[m].in[0] <== 35-m;
        monthSelect[m].in[1] <== activityWindow;
        monthTerm[m] <== monthSelect[m].out * monthlyActivity[m];
        monthCount[m+1] <== monthCount[m] + monthTerm[m];
    }
    component weekSelect[156];
    signal weekTerm[156];
    signal weekCount[157];
    weekCount[0] <== 0;
    for (var w=0; w<156; w++) {
        weeklyActivity[w] * (weeklyActivity[w]-1) === 0;
        weekSelect[w] = LessThan(8);
        weekSelect[w].in[0] <== 155-w;
        weekSelect[w].in[1] <== activityWindow;
        weekTerm[w] <== weekSelect[w].out * weeklyActivity[w];
        weekCount[w+1] <== weekCount[w] + weekTerm[w];
    }
    signal activeCount;
    activeCount <== monthCount[36]+activityIsWeekly*(weekCount[156]-monthCount[36]);
    component activeCountBits = Num2Bits(8);
    activeCountBits.in <== activeCount;
    component activityBelow = LessThan(8);
    activityBelow.in[0] <== activeCount;
    activityBelow.in[1] <== minActivePeriods;
    activityPass <== 1-activityEnabled*activityBelow.out;
}
