// Catálogos de la planilla BancoEstado "Pago (DET-SUBDET) Versión 1.1".
// Copiados sin cambios del panel de referencia.

export const BANCOS = [["012","BANCO DEL ESTADO DE CHILE"],["001","BANCO DE CHILE / A. EDWARDS / CREDICHILE / CITIBANK"],["016","BCI / TBANC / MACH"],["037","SANTANDER / BANEFE"],["039","ITAU / CORPBANCA"],["014","SCOTIABANK / BBVA / DESARROLLO"],["028","BANCO BICE"],["055","BANCO CONSORCIO"],["051","BANCO FALABELLA"],["009","BANCO INTERNACIONAL"],["053","BANCO RIPLEY"],["049","BANCO SECURITY"],["031","HSBC BANK (CHILE)"],["041","JP MORGAN"],["672","COOPEUCH"],["732","CAJA LOS ANDES - CUENTA TAPP"],["729","CAJA LOS HEROES"],["741","COPEC PAY"],["875","MERCADO PAGO"],["730","TENPO PREPAGO"],["266","TRANSBANK"]];

export const FORMAS = [["01","Cuentas BancoEstado y otros bancos"],["02","Cuenta de ahorro (solo BancoEstado)"]];

export const SECTORES = [["02","Fisco y reparticiones gubernativas"],["04","Judiciales y principales"],["06","Agencias descentralizadas"],["10","Sistema previsional público"],["14","Empresas públicas"],["18","Gran minería del cobre y Andina"],["20","Municipalidades"],["22","Sociedad de hecho personas naturales"],["24","Personal BancoEstado y filiales"],["26","Otras personas naturales"],["28","Sindicatos"],["30","Comunidades"],["32","Sociedades y empresas sin fines de lucro"],["34","Otras personas jurídicas sin fines de lucro"],["36","Cajas de compensación"],["38","Sistema previsional privado"],["42","Banco Central de Chile"],["44","Banco del Estado de Chile"],["52","Bancos comerciales"],["58","Corredores de bolsa y agentes de valores"],["59","Compañías de seguro"],["60","Bancos del exterior"],["61","Administradora de fondos de inversión"],["62","Otras entidades financieras sector privado"],["63","Sociedades securitizadoras"],["64","Sociedades y empresas con fines de lucro"],["65","Agentes administradores de mutuos hipotecarios"],["66","Otras personas jurídicas con fines de lucro"],["67","Emisores y operadores TCR"],["68","Cooperativas de ahorro y crédito"],["70","Empresa residente en el exterior"],["71","Gobiernos y agencias gubernamentales ext."],["80","Empresas corporaciones"],["82","Empresas inmobiliarias"],["84","Socios pequeña empresa"],["86","Socio microempresas"],["88","Concesiones"],["90","Constructoras"]];

export const TIPOS = [["30","Factura"],["32","Factura exenta"],["33","Factura electrónica"],["34","Factura exenta electrónica"],["35","Boleta"],["38","Boleta exenta"],["39","Boleta electrónica"],["41","Boleta exenta electrónica"],["45","Factura de compra"],["46","Factura de compra electrónica"],["55","Nota de débito"],["56","Nota de débito electrónica"],["60","Nota de crédito"],["61","Nota de crédito electrónica"],["99","Otros"]];

const mapOf = a => Object.fromEntries(a);
export const M_BANCO = mapOf(BANCOS), M_FORMA = mapOf(FORMAS), M_SECTOR = mapOf(SECTORES), M_TIPO = mapOf(TIPOS);

// Notas de crédito: se restan del total del pago.
export const NC = new Set(["60", "61"]);

// Valores por defecto de pago_config/general.
export const FUENTES_DEFECTO = ["GENERAL", "SEP", "PIE", "FAEP"];
export const EMAIL_DEFECTO = "finanzas@sleppetorca.gob.cl";
// AAAAMMDD se reemplaza por la fecha del día al armar el nombre del archivo.
export const PREFIJO_DEFECTO = "AAAAMMDD_PAGO_PROVEEDORES";

export const EST_PAGO = { pendiente: "Pendiente", pagado: "Pagado", rechazado: "Rechazado" };
export const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
