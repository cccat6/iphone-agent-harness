"""Execute the generated shortcut's branch graph with mocked native actions.
No macOS clipboard access: only record whether Copy/POST would be reached.
"""
import json
import plistlib
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
ACTIONS = plistlib.loads((ROOT / 'tools/shortcuts/iphone-agent-clipboard.plist').read_bytes())['WFWorkflowActions']


def run(job, incoming=None):
    variables, outputs, effects, branches = {}, {}, [], []
    def resolve(x):
        if not isinstance(x, dict):
            return x
        if x.get('Type') == 'Variable' and 'Variable' in x:
            return resolve(x['Variable'])
        v = x.get('Value', x)
        if v.get('Type') == 'ExtensionInput':
            return incoming
        if v.get('Type') == 'Variable':
            return variables.get(v['VariableName'])
        if v.get('Type') == 'ActionOutput':
            return outputs.get(v['OutputUUID'])
        if 'string' in v:
            if v.get('attachmentsByRange'):
                return resolve({'Value': v['attachmentsByRange']['{0, 1}']})
            return v['string']
        raise AssertionError(f'Unsupported token: {x}')
    def present(v):
        return v is not None and v != '' and v != [] and v != {}
    for action in ACTIONS:
        kind = action['WFWorkflowActionIdentifier'].split('.')[-1]
        p = action['WFWorkflowActionParameters']
        active = all(branches)
        if kind == 'conditional':
            mode = p['WFControlFlowMode']
            if mode == 2:
                branches.pop()
            elif mode == 1:
                branches[-1] = not branches[-1]
            elif not active:
                branches.append(False)
            else:
                v, code = resolve(p['WFInput']), p['WFCondition']
                if code == 100: condition = present(v)
                elif code == 101: condition = not present(v)
                elif code == 2: condition = float(v) > float(p['WFNumberValue'])
                elif code == 5: condition = v != resolve(p['WFConditionalActionString'])
                else: raise AssertionError(code)
                branches.append(condition)
            continue
        if not active:
            continue
        result = None
        if kind == 'exit':
            return effects
        elif kind == 'setvariable':
            variables[p['WFVariableName']] = resolve(p['WFInput'])
        elif kind == 'dictionary':
            v = resolve(p['WFInput']); result = json.loads(v) if isinstance(v, str) else v
        elif kind == 'getvalueforkey':
            result = resolve(p['WFInput']).get(p['WFDictionaryKey'])
        elif kind == 'downloadurl':
            method, url = p['WFHTTPMethod'], resolve(p['WFURL'])
            effects.append((method, url)); result = job if method == 'GET' else {'status': 'copied'}
        elif kind == 'setclipboard':
            effects.append(('COPY', resolve(p['WFInput'])))
        elif kind != 'comment':
            raise AssertionError(kind)
        outputs[p['UUID']] = result
    assert not branches
    return effects


class ShortcutBranches(unittest.TestCase):
    def setUp(self):
        self.input = {'jobURL': 'http://bridge/job?token=test', 'ackURL': 'http://bridge/ack?token=test', 'requestId': 'r', 'sessionId': 's', 'targetId': 't'}
        self.job = {k: self.input[k] for k in ['requestId', 'sessionId', 'targetId', 'ackURL']}
        self.job['text'] = 'hello\x00中文🙂'
    def test_empty_keeps_clipboard_and_never_acknowledges_both_launch_modes(self):
        for incoming in [None, self.input]:
            for job in [{'empty': True, 'text': ''}, {'empty': True, 'text': 'must not copy'}, {'text': ''}, {'empty': False, 'text': ''}]:
                with self.subTest(incoming=bool(incoming), job=job):
                    self.assertEqual([e[0] for e in run(job, incoming)], ['GET'])
    def test_real_job_single_get_then_copy_then_ack_both_modes(self):
        for incoming in [None, self.input]:
            for empty_marker in [{}, {'empty': False}]:
                with self.subTest(incoming=bool(incoming), empty_marker=empty_marker):
                    effects = run({**self.job, **empty_marker}, incoming)
                    self.assertEqual([e[0] for e in effects], ['GET', 'COPY', 'POST'])
                    self.assertEqual(effects[1][1], self.job['text'])
    def test_mismatched_explicit_job_does_not_copy(self):
        for key in ['requestId', 'sessionId', 'targetId']:
            self.assertEqual([e[0] for e in run({**self.job, key:'wrong'}, self.input)], ['GET'])
    def test_pending_route_returns_empty_before_stale_source_check(self):
        source = (ROOT/'firmware/IPhoneAutomationHarness/src/SecureService.h').read_text()
        self.assertIn('d["empty"]=true;d["text"]="";return send(r,200,d)',source)
        self.assertLess(source.index('if(noPending)return emptyClipboard(r);'),source.index('if(!sourceMatches)return error(r,403,"clipboard_phone_mismatch");'))
        self.assertIn('streamClipboard(r,requestId,token,latest)',source)

if __name__ == '__main__':
    unittest.main()
