const keys=['label','auto','none','minimal','low','medium','high','xhigh','max','ultra'];
const rows={
 en:['Reasoning effort','Auto','Off','Minimal','Low','Medium','High','Extra high','Maximum','Ultra'],
 'zh-Hans':['推理强度','自动','关闭','极低','低','中','高','超高','最大','极致'],
 'zh-Hant':['推理強度','自動','關閉','極低','低','中','高','超高','最大','極致'],
 ja:['推論の強さ','自動','オフ','最小','低','中','高','非常に高い','最大','ウルトラ'],
 ru:['Глубина рассуждений','Авто','Выкл.','Минимальная','Низкая','Средняя','Высокая','Очень высокая','Максимальная','Ультра'],
 de:['Denktiefe','Automatisch','Aus','Minimal','Niedrig','Mittel','Hoch','Sehr hoch','Maximal','Ultra'],
 fr:['Niveau de raisonnement','Automatique','Désactivé','Minimal','Faible','Moyen','Élevé','Très élevé','Maximum','Ultra'],
 es:['Nivel de razonamiento','Automático','Desactivado','Mínimo','Bajo','Medio','Alto','Muy alto','Máximo','Ultra']
};
export const REASONING_MESSAGES=Object.fromEntries(Object.entries(rows).map(([locale,row])=>[locale,Object.fromEntries(keys.map((key,i)=>['reasoning.'+key,row[i]]))]));
