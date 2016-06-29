/*global Components: false */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  Module for handling PGP/MIME encrypted and/or signed messages
 *  implemented as an XPCOM object
 */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm"); /*global XPCOMUtils: false */
Components.utils.import("resource://annealmail/core.jsm"); /*global AnnealMailCore: false */
Components.utils.import("resource://annealmail/log.jsm"); /*global AnnealMailLog: false */
Components.utils.import("resource://annealmail/mimeDecrypt.jsm"); /*global AnnealMailMimeDecrypt: false */
Components.utils.import("resource://annealmail/mimeVerify.jsm"); /*global AnnealMailVerify: false */
Components.utils.import("resource://annealmail/mime.jsm"); /*global AnnealMailMime: false */

const Cc = Components.classes;
const Ci = Components.interfaces;

const PGPMIME_JS_DECRYPTOR_CONTRACTID = "@mozilla.org/mime/pgp-mime-js-decrypt;1";
const PGPMIME_JS_DECRYPTOR_CID = Components.ID("{7514cbeb-2bfd-4b2c-829b-1a4691fa0ac8}");

////////////////////////////////////////////////////////////////////
// handler for PGP/MIME encrypted and PGP/MIME signed messages
// data is processed from libmime -> nsPgpMimeProxy

var gConv;
var inStream;

var gLastEncryptedUri = "";

const throwErrors = {
  onDataAvailable: function() {
    throw "error";
  },
  onStartRequest: function() {
    throw "error";
  },
  onStopRequest: function() {
    throw "error";
  }
};

/**
 * UnknownProtoHandler is a default handler for unkonwn protocols. It ensures that the
 * signed message part is always displayed without any further action.
 */
function UnknownProtoHandler() {
  if (!gConv) {
    gConv = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
  }

  if (!inStream) {
    inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
  }
}

UnknownProtoHandler.prototype = {
  onStartRequest: function(request) {
    this.mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    this.mimeSvc.onStartRequest(null, null);
    this.bound = AnnealMailMime.getBoundary(this.mimeSvc.contentType);
    /*
      readMode:
        0: before message
        1: inside message
        2: afer message
    */
    this.readMode = 0;
  },

  onDataAvailable: function(req, sup, stream, offset, count) {
    if (count > 0) {
      inStream.init(stream);
      let data = inStream.read(count);
      let l = data.replace(/\r\n/g, "\n").split(/\n/);

      if (data.search(/\n$/) >= 0) {
        l.pop();
      }

      let startIndex = 0;
      let endIndex = l.length;

      if (this.readMode < 2) {
        for (let i = 0; i < l.length; i++) {
          if (l[i].indexOf("--") === 0 && l[i].indexOf(this.bound) === 2) {
            ++this.readMode;
            if (this.readMode === 1) {
              startIndex = i + 1;
            }
            else if (this.readMode === 2) {
              endIndex = i - 1;
            }
          }
        }

        if (this.readMode >= 1 && startIndex < l.length) {
          let out = l.slice(startIndex, endIndex).join("\n") + "\n";
          gConv.setData(out, out.length);
          this.mimeSvc.onDataAvailable(null, null, gConv, 0, out.length);
        }
      }
    }
  },

  onStopRequest: function() {
    this.mimeSvc.onStopRequest(null, null, 0);
  }
};

function PgpMimeHandler() {

  AnnealMailLog.DEBUG("mimeDecrypt.js: PgpMimeHandler()\n"); // always log this one

}

PgpMimeHandler.prototype = {
  classDescription: "AnnealMail JS Decryption Handler",
  classID: PGPMIME_JS_DECRYPTOR_CID,
  contractID: PGPMIME_JS_DECRYPTOR_CONTRACTID,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIStreamListener]),
  inStream: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream),

  onStartRequest: function(request, uri) {
    if (!AnnealMailCore.getService()) // Ensure AnnealMail is initialized
      return null;
    AnnealMailLog.DEBUG("pgpmimeHandler.js: onStartRequest\n");

    let mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    let ct = mimeSvc.contentType;
    AnnealMailLog.DEBUG("pgpmimeHandler.js: ct= " + ct + "\n");

    let cth = null;

    if (ct.search(/^multipart\/encrypted/i) === 0) {
      if (uri) {
        let u = uri.QueryInterface(Ci.nsIURI);
        gLastEncryptedUri = u.spec;
      }
      // PGP/MIME encrypted message
      cth = new AnnealMailMimeDecrypt();
    }
    else if (ct.search(/^multipart\/signed/i) === 0) {
      if (ct.search(/application\/pgp-signature/i) > 0) {
        // PGP/MIME signed message
        cth = AnnealMailVerify.newVerifier();
      }
      else if (ct.search(/application\/(x-)?pkcs7-signature/i) > 0) {
        let lastUriSpec = "";
        if (uri) {
          let u = uri.QueryInterface(Ci.nsIURI);
          lastUriSpec = u.spec;
        }
        // S/MIME signed message
        if (lastUriSpec !== gLastEncryptedUri && AnnealMailVerify.lastMsgWindow) {
          // if message is displayed then handle like S/MIME message
          return this.handleSmime(uri);
        }
        else {
          // otherwise just make sure message body is returned
          cth = AnnealMailVerify.newVerifier("application/pkcs7-signature");
        }
      }
    }

    if (!cth) {
      AnnealMailLog.ERROR("pgpmimeHandler.js: unknown protocol for content-type: " + ct + "\n");
      cth = new UnknownProtoHandler();
    }

    if (cth) {
      this.onDataAvailable = cth.onDataAvailable.bind(cth);
      this.onStopRequest = cth.onStopRequest.bind(cth);
      return cth.onStartRequest(request, uri);
    }

    return null;
  },

  onDataAvailable: function(req, sup, stream, offset, count) {},

  onStopRequest: function(request, win, status) {},

  handleSmime: function(uri) {
    this.contentHandler = throwErrors;

    if (uri) {
      uri = uri.QueryInterface(Ci.nsIURI).clone();
    }

    let headerSink = AnnealMailVerify.lastMsgWindow.msgHeaderSink.securityInfo.QueryInterface(Ci.nsIEnigMimeHeaderSink);
    headerSink.handleSMimeMessage(uri);
  },

  getMessengerWindow: function() {
    let windowManager = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

    let winEnum = windowManager.getEnumerator(null);

    while (winEnum.hasMoreElements()) {
      let thisWin = winEnum.getNext();
      if (thisWin.location.href.search(/\/messenger.xul$/) > 0) {
        return thisWin;
      }
    }

    return null;
  },
};


var NSGetFactory = XPCOMUtils.generateNSGetFactory([PgpMimeHandler]);
