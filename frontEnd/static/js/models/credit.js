(function () {
  "use strict";

  window.newCreditProfile = function (customerId) {
    return {
      id:
        (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : String(Date.now()) + "-" + Math.random().toString(16).slice(2),
      customerId: customerId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      riskBand: "medium",
      requestedLimit: 0,
      requestedTerms: "30_days",

      application: {
        applicationFormReceived: false,
        kycComplete: false,
        hasPOPIAConsent: false,
        hasBureauConsent: false,
        personalGuaranteeRequired: false,
        personalGuaranteeReceived: false,
      },

      bankCheck: {
        accountVerified: false,
        accountNameMatches: false,
        bankCodeObtained: false,
        returnedItemsLast6m: 0,
        persistentOverdraft: false,
      },

      bureauCheck: {
        hasJudgments: false,
        hasDefaults: false,
        hasLiquidationOrBR: false,
        recentEnquiriesCount: 0,
      },

      tradeReferences: {
        required: false,
        referencesCollected: 0,
        anyNegativeFeedback: false,
      },

      financials: {
        financialsRequired: false,
      },

      internalHistory: {
        isExistingCustomer: false,
        disputeFlag: "none",
      },

      decision: {}
    };
  };
})();
