/*global Components: false, AnnealMailCore: false, AnnealMailLog: false, AnnealMailPrefs: false, AnnealMailApp: false, AnnealMailLocale: false, AnnealMailDialog: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["AnnealMailEncryption"];

Components.utils.import("resource://annealmail/core.jsm");
Components.utils.import("resource://annealmail/data.jsm"); /*global AnnealMailData: false */
Components.utils.import("resource://annealmail/log.jsm");
Components.utils.import("resource://annealmail/prefs.jsm");
Components.utils.import("resource://annealmail/app.jsm");
Components.utils.import("resource://annealmail/locale.jsm");
Components.utils.import("resource://annealmail/dialog.jsm");
Components.utils.import("resource://annealmail/ccrAgent.jsm"); /*global AnnealMailCcrAgent: false */
Components.utils.import("resource://annealmail/ccr.jsm"); /*global AnnealMailCcr: false */
Components.utils.import("resource://annealmail/errorHandling.jsm"); /*global AnnealMailErrorHandling: false */
Components.utils.import("resource://annealmail/execution.jsm"); /*global AnnealMailExecution: false */
Components.utils.import("resource://annealmail/files.jsm"); /*global AnnealMailFiles: false */
Components.utils.import("resource://annealmail/passwords.jsm"); /*global AnnealMailPassword: false */
Components.utils.import("resource://annealmail/funcs.jsm"); /*global AnnealMailFuncs: false */
Components.utils.import("resource://annealmail/keyRing.jsm"); /*global AnnealMailKeyRing: false */

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIAnnealMail = Ci.nsIAnnealMail;

var EC = AnnealMailCore;

const gMimeHashAlgorithms = [null, "sha1", "ripemd160", "sha256", "sha384", "sha512", "sha224", "md5"];

const ENC_TYPE_MSG = 0;
const ENC_TYPE_ATTACH_BINARY = 1;
const ENC_TYPE_ATTACH_ASCII = 2;

const CCR_COMMENT_OPT = "Using CodeCrypt with %s - http://annealmail.org";


const AnnealMailEncryption = {
  getEncryptCommand: function(fromMailAddr, toMailAddr, bccMailAddr, hashAlgorithm, sendFlags, isAscii, errorMsgObj) {
    AnnealMailLog.DEBUG("encryption.jsm: getEncryptCommand: hashAlgorithm=" + hashAlgorithm + "\n");

    try {
      fromMailAddr = AnnealMailFuncs.stripEmail(fromMailAddr);
      toMailAddr = AnnealMailFuncs.stripEmail(toMailAddr);
      bccMailAddr = AnnealMailFuncs.stripEmail(bccMailAddr);

    }
    catch (ex) {
      errorMsgObj.value = AnnealMailLocale.getString("invalidEmail");
      return null;
    }

    var defaultSend = sendFlags & nsIAnnealMail.SEND_DEFAULT;
    var signMsg = sendFlags & nsIAnnealMail.SEND_SIGNED;
    var encryptMsg = sendFlags & nsIAnnealMail.SEND_ENCRYPTED;
    var usePgpMime = sendFlags & nsIAnnealMail.SEND_PGP_MIME;

    var useDefaultComment = false;
    try {
      useDefaultComment = AnnealMailPrefs.getPref("useDefaultComment");
    }
    catch (ex) {}

    var hushMailSupport = false;
    try {
      hushMailSupport = AnnealMailPrefs.getPref("hushMailSupport");
    }
    catch (ex) {}

    var detachedSig = (usePgpMime || (sendFlags & nsIAnnealMail.SEND_ATTACHMENT)) && signMsg && !encryptMsg;

    var toAddrList = toMailAddr.split(/\s*,\s*/);
    var bccAddrList = bccMailAddr.split(/\s*,\s*/);
    var k;

    var encryptArgs = AnnealMailCcr.getStandardArgs(true);

    if (!useDefaultComment)
      encryptArgs = encryptArgs.concat(["--comment", CCR_COMMENT_OPT.replace(/\%s/, AnnealMailApp.getName())]);

    var angledFromMailAddr = ((fromMailAddr.search(/^0x/) === 0) || hushMailSupport) ?
      fromMailAddr : "<" + fromMailAddr + ">";
    angledFromMailAddr = angledFromMailAddr.replace(/([\"\'\`])/g, "\\$1");

    if (signMsg && hashAlgorithm) {
      encryptArgs = encryptArgs.concat(["--digest-algo", hashAlgorithm]);
    }

    if (encryptMsg) {
      switch (isAscii) {
        case ENC_TYPE_MSG:
          encryptArgs.push("-a");
          encryptArgs.push("-t");
          break;
        case ENC_TYPE_ATTACH_ASCII:
          encryptArgs.push("-a");
      }

      encryptArgs.push("--encrypt");

      if (signMsg)
        encryptArgs.push("--sign");

      if (sendFlags & nsIAnnealMail.SEND_ALWAYS_TRUST) {
        encryptArgs.push("--trust-model");
        encryptArgs.push("always");
      }
      if ((sendFlags & nsIAnnealMail.SEND_ENCRYPT_TO_SELF) && fromMailAddr)
        encryptArgs = encryptArgs.concat(["--encrypt-to", angledFromMailAddr]);

      for (k = 0; k < toAddrList.length; k++) {
        toAddrList[k] = toAddrList[k].replace(/\'/g, "\\'");
        if (toAddrList[k].length > 0) {
          encryptArgs.push("-r");
          if (toAddrList[k].search(/^GROUP:/) === 0) {
            // groups from ccr.conf file
            encryptArgs.push(toAddrList[k].substr(6));
          }
          else {
            encryptArgs.push((hushMailSupport || (toAddrList[k].search(/^0x/) === 0)) ? toAddrList[k] : "<" + toAddrList[k] + ">");
          }
        }
      }

      for (k = 0; k < bccAddrList.length; k++) {
        bccAddrList[k] = bccAddrList[k].replace(/\'/g, "\\'");
        if (bccAddrList[k].length > 0) {
          encryptArgs.push("--hidden-recipient");
          encryptArgs.push((hushMailSupport || (bccAddrList[k].search(/^0x/) === 0)) ? bccAddrList[k] : "<" + bccAddrList[k] + ">");
        }
      }

    }
    else if (detachedSig) {
      encryptArgs = encryptArgs.concat(["-s", "-b"]);

      switch (isAscii) {
        case ENC_TYPE_MSG:
          encryptArgs = encryptArgs.concat(["-a", "-t"]);
          break;
        case ENC_TYPE_ATTACH_ASCII:
          encryptArgs.push("-a");
      }

    }
    else if (signMsg) {
      encryptArgs = encryptArgs.concat(["-t", "--clearsign"]);
    }

    if (fromMailAddr) {
      encryptArgs = encryptArgs.concat(["-u", angledFromMailAddr]);
    }

    return encryptArgs;
  },

  /**
   * Determine if the sender key ID or user ID can be used for signing and/or encryption
   *
   * @param sendFlags:    Number  - the send Flags; need to contain SEND_SIGNED and/or SEND_ENCRYPTED
   * @param fromMailAddr: String  - the sender email address or key ID
   *
   * @return Object:
   *         - keyId:    String - the found key ID, or null if fromMailAddr is not valid
   *         - errorMsg: String - the erorr message if key not valid, or null if key is valid
   */
  determineOwnKeyUsability: function(sendFlags, fromMailAddr) {
    AnnealMailLog.DEBUG("encryption.jsm: determineOwnKeyUsability: sendFlags=" + sendFlags + ", sender=" + fromMailAddr + "\n");

    let keyList = [];
    let ret = {
      keyId: null,
      errorMsg: null
    };

    let sign = (sendFlags & nsIAnnealMail.SEND_SIGNED ? true : false);
    let encrypt = (sendFlags & nsIAnnealMail.SEND_ENCRYPTED ? true : false);

    if (fromMailAddr.search(/^(0x)?[A-Z0-9]+$/) === 0) {
      // key ID specified
      let key = AnnealMailKeyRing.getKeyById(fromMailAddr);
      keyList.push(key);
    }
    else {
      // email address specified
      keyList = AnnealMailKeyRing.getKeysByUserId(fromMailAddr);
    }

    if (keyList.length === 0) {
      ret.errorMsg = AnnealMailLocale.getString("errorOwnKeyUnusable", fromMailAddr);
      return ret;
    }

    if (sign) {
      keyList = keyList.reduce(function _f(p, keyObj) {
        if (keyObj.getSigningValidity().keyValid) p.push(keyObj);
        return p;
      }, []);
    }

    if (encrypt) {
      keyList = keyList.reduce(function _f(p, keyObj) {
        if (keyObj && keyObj.getEncryptionValidity().keyValid) p.push(keyObj);
        return p;
      }, []);
    }

    if (keyList.length === 0) {
      if (sign) {
        ret.errorMsg = AnnealMailErrorHandling.determineInvSignReason(fromMailAddr);
      }
      else {
        ret.errorMsg = AnnealMailErrorHandling.determineInvRcptReason(fromMailAddr);
      }
    }
    else {
      // TODO: use better algorithm
      ret.keyId = keyList[0].fpr;
    }

    return ret;
  },

  encryptMessageStart: function(win, uiFlags, fromMailAddr, toMailAddr, bccMailAddr,
    hashAlgorithm, sendFlags, listener, statusFlagsObj, errorMsgObj) {
    AnnealMailLog.DEBUG("encryption.jsm: encryptMessageStart: uiFlags=" + uiFlags + ", from " + fromMailAddr + " to " + toMailAddr + ", hashAlgorithm=" + hashAlgorithm + " (" + AnnealMailData.bytesToHex(
      AnnealMailData.pack(sendFlags, 4)) + ")\n");

/*
    let keyUseability = this.determineOwnKeyUsability(sendFlags, fromMailAddr);

    if (!keyUseability.keyId) {
      AnnealMailLog.DEBUG("encryption.jsm: encryptMessageStart: own key invalid\n");
      errorMsgObj.value = keyUseability.errorMsg;
      statusFlagsObj.value = nsIAnnealMail.INVALID_RECIPIENT | nsIAnnealMail.NO_SECKEY | nsIAnnealMail.DISPLAY_MESSAGE;
      return null;
    }
    // TODO: else - use the found key ID
*/

    var pgpMime = uiFlags & nsIAnnealMail.UI_PGP_MIME;

    var hashAlgo = gMimeHashAlgorithms[AnnealMailPrefs.getPref("mimeHashAlgorithm")];

    if (hashAlgorithm) {
      hashAlgo = hashAlgorithm;
    }

    errorMsgObj.value = "";

    if (!sendFlags) {
      AnnealMailLog.DEBUG("encryption.jsm: encryptMessageStart: NO ENCRYPTION!\n");
      errorMsgObj.value = AnnealMailLocale.getString("notRequired");
      return null;
    }

    if (!AnnealMailCore.getService(win)) {
      AnnealMailLog.ERROR("encryption.jsm: encryptMessageStart: not yet initialized\n");
      errorMsgObj.value = AnnealMailLocale.getString("notInit");
      return null;
    }

    var encryptArgs = AnnealMailEncryption.getEncryptCommand(fromMailAddr, toMailAddr, bccMailAddr, hashAlgo, sendFlags, ENC_TYPE_MSG, errorMsgObj);

    /*
    if (!encryptArgs)
      return null;
  */
    var signMsg = sendFlags & nsIAnnealMail.SEND_SIGNED;
    var encryptMsg = sendFlags & nsIAnnealMail.SEND_ENCRYPTED;

    var encryptArgs = ['-'];
    if (signMsg) {
      encryptArgs[0] += 'Cs';
      var fromMailFormat = fromMailAddr;
      if ((fromMailAddr[0] === '@') || (fromMailAddr.indexOf('0x@') === 0)) {
        fromMailFormat = fromMailAddr.substring(2, fromMailAddr.indexOf('.'));
      } else if (fromMailAddr.indexOf('@') > 0) {
        fromMailFormat = fromMailAddr.split('@')[0];
      }
      encryptArgs = encryptArgs.concat(['-u', fromMailFormat]);
    }
    if (encryptMsg) {
      encryptArgs[0] += 'ae';
      var toMailFormat = toMailAddr;
      if (toMailAddr[0] === '@') {
        toMailFormat = '@' + toMailAddr.substring(2, toMailAddr.indexOf('.')).toLowerCase();
      } else if (toMailAddr.indexOf('0x_@') === 0) {
        toMailFormat = '@' + toMailAddr.substring(4, toMailAddr.indexOf('.')).toLowerCase();
      } else if (toMailAddr.indexOf('0x@') === 0) {
        toMailFormat = '@' + toMailAddr.substring(3, toMailAddr.indexOf('.')).toLowerCase();
      } else if (toMailAddr.indexOf('@') > 0) {
        toMailFormat = toMailAddr.split('@')[0];
      }
      encryptArgs = encryptArgs.concat(['-r', toMailFormat]);
    }

    var proc = AnnealMailExecution.execStart(AnnealMailCcrAgent.agentPath, encryptArgs, signMsg, win, listener, statusFlagsObj);

    if (statusFlagsObj.value & nsIAnnealMail.MISSING_PASSPHRASE) {
      AnnealMailLog.ERROR("encryption.jsm: encryptMessageStart: Error - no passphrase supplied\n");

      errorMsgObj.value = "";
    }

    if (pgpMime && errorMsgObj.value) {
      AnnealMailDialog.alert(win, errorMsgObj.value);
    }

    return proc;
  },

  encryptMessageEnd: function(fromMailAddr, stderrStr, exitCode, uiFlags, sendFlags, outputLen, retStatusObj) {
    AnnealMailLog.DEBUG("encryption.jsm: encryptMessageEnd: uiFlags=" + uiFlags + ", sendFlags=" + AnnealMailData.bytesToHex(AnnealMailData.pack(sendFlags, 4)) + ", outputLen=" + outputLen + "\n");

    var pgpMime = uiFlags & nsIAnnealMail.UI_PGP_MIME;
    var defaultSend = sendFlags & nsIAnnealMail.SEND_DEFAULT;
    var signMsg = sendFlags & nsIAnnealMail.SEND_SIGNED;
    var encryptMsg = sendFlags & nsIAnnealMail.SEND_ENCRYPTED;

    retStatusObj.statusFlags = 0;
    retStatusObj.errorMsg = "";
    retStatusObj.blockSeparation = "";

    if (!AnnealMailCore.getService().initialized) {
      AnnealMailLog.ERROR("encryption.jsm: encryptMessageEnd: not yet initialized\n");
      retStatusObj.errorMsg = AnnealMailLocale.getString("notInit");
      return -1;
    }

    AnnealMailErrorHandling.parseErrorOutput(stderrStr, retStatusObj);

    exitCode = AnnealMailExecution.fixExitCode(exitCode, retStatusObj);
    if ((exitCode === 0) && !outputLen) {
      exitCode = -1;
    }

    if (exitCode !== 0 && (signMsg || encryptMsg)) {
      // GnuPG might return a non-zero exit code, even though the message was correctly
      // signed or encryped -> try to fix the exit code

      var correctedExitCode = 0;
      if (signMsg) {
        if (!(retStatusObj.statusFlags & nsIAnnealMail.SIG_CREATED)) correctedExitCode = exitCode;
      }
      if (encryptMsg) {
        if (!(retStatusObj.statusFlags & nsIAnnealMail.END_ENCRYPTION)) correctedExitCode = exitCode;
      }
      exitCode = correctedExitCode;
    }

    AnnealMailLog.DEBUG("encryption.jsm: encryptMessageEnd: command execution exit code: " + exitCode + "\n");

    if (retStatusObj.statusFlags & nsIAnnealMail.DISPLAY_MESSAGE) {
      if (retStatusObj.extendedStatus.search(/\bdisp:/) >= 0) {
        retStatusObj.errorMsg = retStatusObj.statusMsg;
      }
      else {
        if (fromMailAddr.search(/^0x/) === 0) {
          fromMailAddr = fromMailAddr.substr(2);
        }
        if (fromMailAddr.search(/^[A-F0-9]{8,40}$/i) === 0) {
          fromMailAddr = "[A-F0-9]+" + fromMailAddr;
        }

        let s = new RegExp("^(\\[GNUPG:\\] )?INV_(RECP|SGNR) [0-9]+ (\\<|0x)?" + fromMailAddr + "\\>?", "m");
        if (retStatusObj.statusMsg.search(s) >= 0) {
          retStatusObj.errorMsg += "\n\n" + AnnealMailLocale.getString("keyError.resolutionAction");
        }
        else if (retStatusObj.statusMsg.length > 0) {
          retStatusObj.errorMsg = retStatusObj.statusMsg;
        }
      }
    }
    else if (retStatusObj.statusFlags & nsIAnnealMail.INVALID_RECIPIENT) {
      retStatusObj.errorMsg = retStatusObj.statusMsg;
    }
    else if (exitCode !== 0) {
      retStatusObj.errorMsg = AnnealMailLocale.getString("badCommand");
    }

    return exitCode;
  },

  encryptMessage: function(parent, uiFlags, plainText, fromMailAddr, toMailAddr, bccMailAddr, sendFlags,
    exitCodeObj, statusFlagsObj, errorMsgObj) {
    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.encryptMessage: " + plainText.length + " bytes from " + fromMailAddr + " to " + toMailAddr + " (" + sendFlags + ")\n");

    exitCodeObj.value = -1;
    statusFlagsObj.value = 0;
    errorMsgObj.value = "";

    if (!plainText) {
      AnnealMailLog.DEBUG("annealmail.js: AnnealMail.encryptMessage: NO ENCRYPTION!\n");
      exitCodeObj.value = 0;
      AnnealMailLog.DEBUG("  <=== encryptMessage()\n");
      return plainText;
    }

    var defaultSend = sendFlags & nsIAnnealMail.SEND_DEFAULT;
    var signMsg = sendFlags & nsIAnnealMail.SEND_SIGNED;
    var encryptMsg = sendFlags & nsIAnnealMail.SEND_ENCRYPTED;

    if (encryptMsg) {
      // First convert all linebreaks to newlines
      plainText = plainText.replace(/\r\n/g, "\n");
      plainText = plainText.replace(/\r/g, "\n");

      // we need all data in CRLF according to RFC 4880
      plainText = plainText.replace(/\n/g, "\r\n");
    }

    // AnnealMail hacks
    var encryptArgs = ['-'];
    if (signMsg) {
      encryptArgs[0] += 'Cs';
      var fromMailFormat = fromMailAddr;
      if ((fromMailAddr[0] === '@') || (fromMailAddr.indexOf('0x@') === 0)) {
        fromMailFormat = fromMailAddr.substring(2, fromMailAddr.indexOf('.'));
      } else if (fromMailAddr.indexOf('@') > 0) {
        fromMailFormat = fromMailAddr.split('@')[0];
      }
      encryptArgs = encryptArgs.concat(['-u', fromMailFormat]);
    }
    if (encryptMsg) {
      encryptArgs[0] += 'ae';
      var toMailFormat = toMailAddr;
      if (toMailAddr[0] === '@') {
        toMailFormat = '@' + toMailAddr.substring(2, toMailAddr.indexOf('.')).toLowerCase();
      } else if (toMailAddr.indexOf('0x_@') === 0) {
        toMailFormat = '@' + toMailAddr.substring(4, toMailAddr.indexOf('.')).toLowerCase();
      } else if (toMailAddr.indexOf('0x@') === 0) {
        toMailFormat = '@' + toMailAddr.substring(3, toMailAddr.indexOf('.')).toLowerCase();
      } else if (toMailAddr.indexOf('@') > 0) {
        toMailFormat = toMailAddr.split('@')[0];
      }
      encryptArgs = encryptArgs.concat(['-r', toMailFormat]);
    }

    var inspector = Cc["@mozilla.org/jsinspector;1"].createInstance(Ci.nsIJSInspector);

    var listener = AnnealMailExecution.newSimpleListener(
      function _stdin(pipe) {
        pipe.write(plainText);
        pipe.close();
      },
      function _done(exitCode) {
        // unlock wait
        if (inspector.eventLoopNestLevel > 0) {
          inspector.exitNestedEventLoop();
        }
      });

/*
    var proc = AnnealMailEncryption.encryptMessageStart(parent, uiFlags,
      fromMailAddr, toMailAddr, bccMailAddr,
      null, sendFlags,
      listener, statusFlagsObj, errorMsgObj);
*/

    var proc = AnnealMailExecution.execStart(AnnealMailCcrAgent.agentPath, encryptArgs, signMsg, parent, listener, statusFlagsObj);

    if (!proc) {
      exitCodeObj.value = -1;
      AnnealMailLog.DEBUG("  <=== encryptMessage()\n");
      return "";
    }

    // Wait for child pipes to close
    inspector.enterNestedEventLoop(0);

    var retStatusObj = {};
    exitCodeObj.value = AnnealMailEncryption.encryptMessageEnd(fromMailAddr, AnnealMailData.getUnicodeData(listener.stderrData), listener.exitCode,
      uiFlags, sendFlags,
      listener.stdoutData.length,
      retStatusObj);

    statusFlagsObj.value = retStatusObj.statusFlags;
    statusFlagsObj.statusMsg = retStatusObj.statusMsg;
    errorMsgObj.value = retStatusObj.errorMsg;

    if ((exitCodeObj.value === 0) && listener.stdoutData.length === 0)
      exitCodeObj.value = -1;

    if (exitCodeObj.value === 0) {
      // Normal return
      AnnealMailLog.DEBUG("  <=== encryptMessage()\n");
      var encryptedContent = listener.stdoutData;
      return AnnealMailData.getUnicodeData(encryptedContent);
    }

    if (exitCodeObj.value === 0) {
      // Normal return
      AnnealMailLog.DEBUG("  <=== encryptMessage()\n");
      return AnnealMailData.getUnicodeData(encryptedContent);
    }

    // Error processing
    AnnealMailLog.DEBUG("annealmail.js: AnnealMail.encryptMessage: command execution exit code: " + exitCodeObj.value + "\n");
    return "";
  },

  encryptAttachment: function(parent, fromMailAddr, toMailAddr, bccMailAddr, sendFlags, inFile, outFile,
    exitCodeObj, statusFlagsObj, errorMsgObj) {
    AnnealMailLog.DEBUG("encryption.jsm: AnnealMailEncryption.encryptAttachment infileName=" + inFile.path + "\n");

    statusFlagsObj.value = 0;
    sendFlags |= nsIAnnealMail.SEND_ATTACHMENT;

    let asciiArmor = false;
    try {
      asciiArmor = AnnealMailPrefs.getPrefBranch().getBoolPref("inlineAttachAsciiArmor");
    }
    catch (ex) {}

    const asciiFlags = (asciiArmor ? ENC_TYPE_ATTACH_ASCII : ENC_TYPE_ATTACH_BINARY);
    let args = AnnealMailEncryption.getEncryptCommand(fromMailAddr, toMailAddr, bccMailAddr, "", sendFlags, asciiFlags, errorMsgObj);

    if (!args) {
      return null;
    }

    const signMessage = (sendFlags & nsIAnnealMail.SEND_SIGNED);

    if (signMessage) {
      args = args.concat(AnnealMailPassword.command());
    }

    const inFilePath = AnnealMailFiles.getEscapedFilename(AnnealMailFiles.getFilePathReadonly(inFile.QueryInterface(Ci.nsIFile)));
    const outFilePath = AnnealMailFiles.getEscapedFilename(AnnealMailFiles.getFilePathReadonly(outFile.QueryInterface(Ci.nsIFile)));

    args = args.concat(["--yes", "-o", outFilePath, inFilePath]);

    let cmdErrorMsgObj = {};

    const msg = AnnealMailExecution.execCmd(AnnealMailCcrAgent.agentPath, args, "", exitCodeObj, statusFlagsObj, {}, cmdErrorMsgObj);
    if (exitCodeObj.value !== 0) {
      if (cmdErrorMsgObj.value) {
        errorMsgObj.value = AnnealMailFiles.formatCmdLine(AnnealMailCcrAgent.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }
      else {
        errorMsgObj.value = "An unknown error has occurred";
      }

      return "";
    }

    return msg;
  },

  registerOn: function(target) {
    target.encryptMessage = AnnealMailEncryption.encryptMessage;
    target.encryptAttachment = AnnealMailEncryption.encryptAttachment;
  }
};
