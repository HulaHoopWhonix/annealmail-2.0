/* global AnnealMail: false, Assert: false, do_load_module: false, trustAllKeys_test: false, JSUnit: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

var window;
var document;

function trustAllKeys_test() {
  // test functionality of trustAllKeys
  AnnealMail.msg.trustAllKeys = true;
  AnnealMail.msg.tempTrustAllKeys();
  Assert.equal(AnnealMail.msg.trustAllKeys, false, "check trustAllKeys is false");

  AnnealMail.msg.tempTrustAllKeys();
  Assert.equal(AnnealMail.msg.trustAllKeys, true, "check trustAllKeys is true");


}

function run_test() {
  window = JSUnit.createStubWindow();
  window.document = JSUnit.createDOMDocument();
  document = window.document;

  do_load_module("chrome://annealmail/content/annealmailMsgComposeOverlay.js");

  trustAllKeys_test();
}
