// Config plugin to remove Push Notifications entitlement
// Required for building with a free Apple Developer account
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function removePushEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });
};
