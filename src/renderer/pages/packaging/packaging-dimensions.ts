import type { PackagingParameter } from '../../../core/packaging/packaging-types';

export type DimensionAxis = NonNullable<PackagingParameter['axis']>;
export type MatchingBasis = '0' | '2' | '3';
export const axisLabels:Record<DimensionAxis,string>={length:'长',width:'宽',height:'高'};

export function resolveParameterAxis(parameter:PackagingParameter):DimensionAxis|undefined {
  if(parameter.type!=='number')return undefined;
  if(parameter.axis)return parameter.axis;
  const names=[parameter.key.toLowerCase(),parameter.label];
  if(names.some(name=>['length','long','l','长','长度'].includes(name)))return 'length';
  if(names.some(name=>['width','wide','w','宽','宽度'].includes(name)))return 'width';
  if(names.some(name=>['height','high','h','高','高度'].includes(name)))return 'height';
  return undefined;
}
export function dimensionDefinitions(parameters:PackagingParameter[]) {
  return parameters.filter(parameter=>resolveParameterAxis(parameter)).map(parameter=>({...parameter,label:axisLabels[resolveParameterAxis(parameter)!]}));
}
export function matchingBasis(parameters:PackagingParameter[]):MatchingBasis {
  const axes=parameters.filter(p=>p.required||p.axis).map(resolveParameterAxis);
  return axes.includes('height')?'3':axes.some(Boolean)?'2':'0';
}
export function dimensionLabel(parameters:PackagingParameter[],key:string):string {
  const parameter=parameters.find(p=>p.key===key);
  const axis=parameter&&resolveParameterAxis(parameter);
  return axis?axisLabels[axis]:parameter?.label??'历史条件';
}
