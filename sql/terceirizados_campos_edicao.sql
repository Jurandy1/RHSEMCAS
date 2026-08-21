SELECT
  f.id,
  f.foto_url                         AS foto,
  f.nome                             AS nome_completo,
  f.cpf                              AS cpf,
  f.data_admissao                    AS data_admissao,
  f.email                            AS email,
  f.telefone                         AS telefone,
  f.empresa                          AS nome_da_empresa,
  COALESCE(vfa.lotacao_nome, l.nome) AS lotacao,
  COALESCE(vfa.vinculo, v.categoria) AS vinculo,
  COALESCE(vfa.turno, t.nome)        AS turno,
  f.cargo                            AS cargo,
  COALESCE(vfa.funcao, fl.funcao)    AS funcao,
  f.observacao                       AS observacao
FROM public.funcionarios f
LEFT JOIN public.v_funcionarios_atual vfa
  ON vfa.funcionario_id = f.id
LEFT JOIN public.funcionario_lotacao fl
  ON fl.funcionario_id = f.id AND fl.ativo = true
LEFT JOIN public.lotacoes l
  ON l.id = fl.lotacao_id
LEFT JOIN public.vinculos v
  ON v.id = fl.vinculo_id
LEFT JOIN public.turnos t
  ON t.id = fl.turno_id
WHERE f.ativo = true
  AND (
    COALESCE(vfa.vinculo, v.categoria, '') ILIKE '%terceiriz%'
    OR NULLIF(TRIM(f.empresa), '') IS NOT NULL
  )
ORDER BY f.empresa NULLS LAST, f.nome;
