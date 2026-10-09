pragma circom 2.2.3;
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// PROVISIONAL v0.2: epoch-day 0 is absent; calendar-anniversary tenure,
// clamped to the target month's last day. UTC Gregorian domain 1970..9999.
template DivConstant(d, bits) {
    signal input in;
    signal output q;
    signal output r;
    q <-- in \ d;
    r <-- in % d;
    in === q*d+r;
    component qb = Num2Bits(bits); qb.in <== q;
    component rb = Num2Bits(bits); rb.in <== r;
    component bound = LessThan(bits); bound.in[0] <== r; bound.in[1] <== d;
    bound.out === 1;
}
template CalendarDate() {
    signal input year;
    signal input month;
    signal input day;
    signal output epochDay;
    signal output daysInMonth;
    component y = Num2Bits(14); y.in <== year;
    component lower = LessThan(14); lower.in[0] <== year; lower.in[1] <== 1970; lower.out === 0;
    component upper = LessThan(14); upper.in[0] <== year; upper.in[1] <== 10000; upper.out === 1;
    component mb = Num2Bits(4); mb.in <== month;
    component db = Num2Bits(5); db.in <== day;
    component d0 = IsZero(); d0.in <== day; d0.out === 0;
    component div4 = DivConstant(4,14); div4.in <== year;
    component div100 = DivConstant(100,14); div100.in <== year;
    component div400 = DivConstant(400,14); div400.in <== year;
    component z4 = IsZero(); z4.in <== div4.r;
    component z100 = IsZero(); z100.in <== div100.r;
    component z400 = IsZero(); z400.in <== div400.r;
    signal leap; leap <== z4.out*(1-z100.out)+z400.out;
    component previous4 = DivConstant(4,14); previous4.in <== year-1;
    component previous100 = DivConstant(100,14); previous100.in <== year-1;
    component previous400 = DivConstant(400,14); previous400.in <== year-1;
    var lengths[12] = [31,28,31,30,31,30,31,31,30,31,30,31];
    var offsets[12] = [0,31,59,90,120,151,181,212,243,273,304,334];
    component months[12];
    var selected=0; var length=0; var offset=0; var afterFebruary=0;
    for (var i=0;i<12;i++) {
        months[i] = IsEqual(); months[i].in[0] <== month; months[i].in[1] <== i+1;
        selected += months[i].out; length += months[i].out*lengths[i];
        offset += months[i].out*offsets[i];
        if (i>=2) afterFebruary += months[i].out;
    }
    selected === 1;
    daysInMonth <== length+months[1].out*leap;
    component dayBound = LessEqThan(6); dayBound.in[0] <== day; dayBound.in[1] <== daysInMonth; dayBound.out === 1;
    epochDay <== 365*(year-1970)+previous4.q-previous100.q+previous400.q-477+offset+afterFebruary*leap+day-1;
}
template History() {
    signal input verifiedHistoryStartDate;
    signal input evidenceUpdatedAt;
    signal input historyEnabled;
    signal input minHistoryMonths;
    // Private calendar witness; ALL values checked, never trusted date arithmetic.
    signal input cutoffYear;
    signal input cutoffMonth;
    signal input cutoffDay;
    signal input targetYear;
    signal input targetMonth;
    signal input targetDay;
    signal output historyPass;
    historyEnabled*(historyEnabled-1) === 0;
    component n = Num2Bits(9); n.in <== minHistoryMonths;
    component nb = LessEqThan(9); nb.in[0] <== minHistoryMonths; nb.in[1] <== 360; nb.out === 1;
    component nz = IsZero(); nz.in <== minHistoryMonths; historyEnabled*nz.out === 0;
    (1-historyEnabled)*minHistoryMonths === 0;
    component ts = Num2Bits(40); ts.in <== evidenceUpdatedAt;
    component start = Num2Bits(22); start.in <== verifiedHistoryStartDate;
    component seconds = DivConstant(86400,40); seconds.in <== evidenceUpdatedAt;
    component cutoff = CalendarDate(); cutoff.year <== cutoffYear; cutoff.month <== cutoffMonth; cutoff.day <== cutoffDay;
    cutoff.epochDay === seconds.q;
    component target = CalendarDate(); target.year <== targetYear; target.month <== targetMonth; target.day <== targetDay;
    targetYear*12+targetMonth === cutoffYear*12+cutoffMonth-minHistoryMonths;
    component clamp = LessThan(6); clamp.in[0] <== target.daysInMonth; clamp.in[1] <== cutoffDay;
    targetDay === cutoffDay+clamp.out*(target.daysInMonth-cutoffDay);
    component present = IsZero(); present.in <== verifiedHistoryStartDate;
    component future = LessEqThan(22); future.in[0] <== verifiedHistoryStartDate; future.in[1] <== cutoff.epochDay; future.out === 1;
    component comparison = LessEqThan(22); comparison.in[0] <== verifiedHistoryStartDate; comparison.in[1] <== target.epochDay;
    signal qualifies; qualifies <== (1-present.out)*comparison.out;
    historyPass <== 1-historyEnabled+historyEnabled*qualifies;
}
