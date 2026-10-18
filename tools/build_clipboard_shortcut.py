"""Generate the inspectable shortcut plist; sign separately with Apple's CLI."""
from pathlib import Path
import plistlib
import uuid

ROOT = Path(__file__).resolve().parent.parent
actions = []
def uid(label):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'igent.cc/clipboard-shortcut/' + label)).upper()
def attachment(value):
    return {'Value': value, 'WFSerializationType': 'WFTextTokenAttachment'}
def variable(name):
    return attachment({'Type': 'Variable', 'VariableName': name})
def output(action, name='Result'):
    return attachment({'Type': 'ActionOutput', 'OutputUUID': action, 'OutputName': name})
def text_token(value):
    if isinstance(value, dict):
        return {'Value': {'string': '\ufffc', 'attachmentsByRange': {'{0, 1}': value['Value']}}, 'WFSerializationType': 'WFTextTokenString'}
    return {'Value': {'string': value}, 'WFSerializationType': 'WFTextTokenString'}
def action(kind, **parameters):
    identifier = uid(str(len(actions)) + kind)
    actions.append({'WFWorkflowActionIdentifier': 'is.workflow.actions.' + kind, 'WFWorkflowActionParameters': {'UUID': identifier, **parameters}})
    return output(identifier)
def value(key, source):
    return action('getvalueforkey', WFInput=source, WFGetDictionaryValueType='Value', WFDictionaryKey=key)
def setvar(name, source):
    action('setvariable', WFInput=source, WFVariableName=name)
def condition(source, code, group, mode=0, **extra):
    parameters = {'GroupingIdentifier': group, 'WFControlFlowMode': mode}
    if mode == 0:
        parameters.update(WFInput={'Type': 'Variable', 'Variable': source}, WFCondition=code, **extra)
    return action('conditional', **parameters)
def stop_if_empty(label):
    # JSON booleans are numeric in Shortcuts. Missing marker is normal for jobs.
    empty = value('empty', variable('Job'))
    marker = uid(label + '-has-empty-marker')
    condition(empty, 100, marker)
    is_empty = uid(label + '-empty-true')
    condition(empty, 2, is_empty, WFNumberValue='0')
    action('exit')
    condition(empty, 2, is_empty, mode=2)
    condition(empty, 100, marker, mode=2)
    text = value('text', variable('Job'))
    absent = uid(label + '-no-text')
    condition(text, 101, absent)
    action('exit')
    condition(text, 101, absent, mode=2)

action('comment', WFCommentActionText='iPhone Agent Clipboard: fetch the current local bridge job, copy its text, then acknowledge copying. No phone operation is performed here. Launch from Harness; without input, use the pending job on igent.local. The bridge verifies the requesting phone. Never paste until Harness observes the copy receipt.')
incoming = attachment({'Type': 'ExtensionInput'})
branch = uid('has-input')
condition(incoming, 100, branch)
setvar('Input', action('detect.dictionary', WFInput=incoming))
job_url = value('jobURL', variable('Input'))
setvar('Job', action('downloadurl', WFURL=job_url, WFHTTPMethod='GET'))
stop_if_empty('explicit')
setvar('Ack URL', value('ackURL', variable('Input')))
for field in ['requestId', 'sessionId', 'targetId']:
    expected = value(field, variable('Input'))
    actual = value(field, variable('Job'))
    group = uid('verify-' + field)
    condition(actual, 5, group, WFConditionalActionString=text_token(expected))
    action('exit')
    condition(actual, 5, group, mode=2)
condition(incoming, 100, branch, mode=1)
setvar('Job', action('downloadurl', WFURL='http://igent.local/v1/clipboard/pending', WFHTTPMethod='GET'))
stop_if_empty('pending')
setvar('Ack URL', value('ackURL', variable('Job')))
condition(incoming, 100, branch, mode=2)

copy_text = value('text', variable('Job'))
has_text = uid('has-text')
condition(copy_text, 101, has_text)
action('exit')
condition(copy_text, 101, has_text, mode=2)
action('setclipboard', WFInput=copy_text, WFLocalOnly=True)
items = []
for field in ['requestId', 'sessionId', 'targetId']:
    item_value = value(field, variable('Job'))
    items.append({'WFItemType': 0, 'WFKey': text_token(field), 'WFValue': text_token(item_value)})
items.append({'WFItemType': 4, 'WFKey': text_token('copied'), 'WFValue': {'Value': True, 'WFSerializationType': 'WFBooleanSubstitutableState'}})
action('downloadurl', WFURL=variable('Ack URL'), WFHTTPMethod='POST', WFHTTPBodyType='JSON', WFJSONValues={'Value': {'WFDictionaryFieldValueItems': items}, 'WFSerializationType': 'WFDictionaryFieldValue'})

workflow = {'WFWorkflowName': 'iPhone Agent Clipboard', 'WFWorkflowMinimumClientVersion': 900, 'WFWorkflowMinimumClientVersionString': '900', 'WFWorkflowClientVersion': '3301.0.1', 'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 61440}, 'WFWorkflowActions': actions, 'WFWorkflowInputContentItemClasses': ['WFTextContentItem'], 'WFWorkflowOutputContentItemClasses': [], 'WFWorkflowTypes': [], 'WFQuickActionSurfaces': [], 'WFWorkflowImportQuestions': [], 'WFWorkflowHasShortcutInputVariables': True, 'WFWorkflowHasOutputFallback': False}
destination = ROOT / 'tools/shortcuts/iphone-agent-clipboard.plist'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False))
print(f'Generated {len(actions)} actions: {destination}')
