pragma circom 2.2.3;
include "history-core.circom";
component main {public [evidenceUpdatedAt, historyEnabled, minHistoryMonths]} = History();
