/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailTrust"];

Components.utils.import("resource://annealmail/locale.jsm"); /*global AnnealMailLocale: false */

// trust flags according to CCR documentation:
// - sources: doc/DETAILS
// In the order of trustworthy:
//  ---------------------------------------------------------
//  i = The key is invalid (e.g. due to a missing self-signature)
//  n = The key is not valid / Never trust this key
//  d/D = The key has been disabled
//  r = The key has been revoked
//  e = The key has expired
//  g = group (???)
//  ---------------------------------------------------------
//  ? = INTERNAL VALUE to separate invalid from unknown keys
//      see validKeysForAllRecipients() in annealmailMsgComposeHelper.js
//  ---------------------------------------------------------
//  o = Unknown (this key is new to the system)
//  - = Unknown validity (i.e. no value assigned)
//  q = Undefined validity (Not enough information for calculation)
//      '-' and 'q' may safely be treated as the same value for most purposes
//  ---------------------------------------------------------
//  m = Marginally trusted
//  ---------------------------------------------------------
//  f = Fully trusted / valid key
//  u = Ultimately trusted
//  ---------------------------------------------------------
const TRUSTLEVELS_SORTED = "indDreg?o-qmfu";
const TRUSTLEVELS_SORTED_IDX_UNKNOWN = 7; // index of '?'

const AnnealMailTrust = {
  /**
   * @return - |string| containing the order of trust/validity values
   */
  trustLevelsSorted: function() {
    return TRUSTLEVELS_SORTED;
  },

  /**
   * @return - |boolean| whether the flag is invalid (neither unknown nor valid)
   */
  isInvalid: function(flag) {
    return TRUSTLEVELS_SORTED.indexOf(flag) < TRUSTLEVELS_SORTED_IDX_UNKNOWN;
  },

  /**
   * return a merged value of trust level "key disabled"
   *
   * @keyObj - |object| containing the key data
   *
   * @return - |string| containing the trust value or "D" for disabled keys
   */
  getTrustCode: function(keyObj) {
    if (keyObj.keyUseFor.indexOf("D") >= 0) {
      return "D";
    }
    else {
      return keyObj.keyTrust;
    }
  },

  getTrustLabel: function(trustCode) {
    let keyTrust;
    switch (trustCode) {
      case 'q':
        keyTrust = AnnealMailLocale.getString("keyValid.unknown");
        break;
      case 'i':
        keyTrust = AnnealMailLocale.getString("keyValid.invalid");
        break;
      case 'd':
      case 'D':
        keyTrust = AnnealMailLocale.getString("keyValid.disabled");
        break;
      case 'r':
        keyTrust = AnnealMailLocale.getString("keyValid.revoked");
        break;
      case 'e':
        keyTrust = AnnealMailLocale.getString("keyValid.expired");
        break;
      case 'n':
        keyTrust = AnnealMailLocale.getString("keyTrust.untrusted");
        break;
      case 'm':
        keyTrust = AnnealMailLocale.getString("keyTrust.marginal");
        break;
      case 'f':
        keyTrust = AnnealMailLocale.getString("keyTrust.full");
        break;
      case 'u':
        keyTrust = AnnealMailLocale.getString("keyTrust.ultimate");
        break;
      case 'g':
        keyTrust = AnnealMailLocale.getString("keyTrust.group");
        break;
      case '-':
        keyTrust = "-";
        break;
      default:
        keyTrust = "";
    }
    return keyTrust;
  }
};
