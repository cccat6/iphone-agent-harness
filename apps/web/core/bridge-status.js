// Trusted application state only. Screen frames never prove bridge connectivity.
export function bridgeStatus(context={}) {
  const state=(value,fallback='unknown')=>['connected','disconnected','unknown'].includes(value)?value:fallback;
  return {
    bridgeConnection:state(context.bridgeConnection,context.identityVerified===true?'connected':'unknown'),
    bluetoothConnection:state(context.bluetoothConnection),
    inputVerified:typeof context.inputVerified==='boolean'?context.inputVerified:context.bindingVerified===true,
  };
}
export function phoneInputError(context={}) {
  const status=bridgeStatus(context);
  if(status.bridgeConnection!=='connected')return Object.assign(new Error('DEVICE_BRIDGE_UNAVAILABLE'),{code:'DEVICE_BRIDGE_UNAVAILABLE',retryable:false,reason:'bridge_unavailable'});
  if(status.bluetoothConnection==='disconnected')return Object.assign(new Error('DEVICE_BLUETOOTH_UNAVAILABLE'),{code:'DEVICE_BLUETOOTH_UNAVAILABLE',retryable:false,reason:'bluetooth_disconnected'});
  if(!status.inputVerified)return Object.assign(new Error('DEVICE_INPUT_UNVERIFIED'),{code:'DEVICE_INPUT_UNVERIFIED',retryable:false,reason:'input_unverified'});
  return null;
}
export function assertBridgePresent(context={}) {
  if(context.bridgeConnection==='disconnected'||context.bridgeConnection==='unknown')throw phoneInputError({...context,bridgeConnection:'disconnected'});
}
