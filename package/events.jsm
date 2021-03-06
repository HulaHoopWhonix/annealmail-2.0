/*global Components: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailEvents"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Cu.import("resource://annealmail/timer.jsm"); /*global AnnealMailTimer: false */

const AnnealMailEvents = {
  /**
   * dispatch event aynchronously to the main thread
   *
   * @callbackFunction: Function - any function specification
   * @sleepTimeMs:      Number - optional number of miliseconds to delay
   *                             (0 if not specified)
   * @arrayOfArgs:      Array - arguments to pass to callbackFunction
   */
  dispatchEvent: function(callbackFunction, sleepTimeMs, arrayOfArgs) {
    AnnealMailLog.DEBUG("annealmailCommon.jsm: dispatchEvent f=" + callbackFunction.name + "\n");

    // object for dispatching callback back to main thread
    var MainEvent = function() {};

    MainEvent.prototype = {
      QueryInterface: function(iid) {
        if (iid.equals(Ci.nsIRunnable) ||
          iid.equals(Ci.nsISupports)) {
          return this;
        }
        throw Components.results.NS_ERROR_NO_INTERFACE;
      },

      init: function(cbFunc, arrayOfArgs) {
        this.cbFunc = cbFunc;
        this.args = arrayOfArgs;
      },

      run: function() {
        AnnealMailLog.DEBUG("annealmailCommon.jsm: dispatchEvent running mainEvent\n");
        this.cbFunc(this.args);
      },

      notify: function() {
        AnnealMailLog.DEBUG("annealmailCommon.jsm: dispatchEvent got notified\n");
        this.cbFunc(this.args);
      }

    };

    const event = new MainEvent();
    event.init(callbackFunction, arrayOfArgs);
    if (sleepTimeMs > 0) {
      return AnnealMailTimer.setTimeout(event, sleepTimeMs);
    }
    else {
      const tm = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager);
      // dispatch the event to the main thread
      tm.mainThread.dispatch(event, Ci.nsIThread.DISPATCH_NORMAL);
    }

    return event;
  }
};
