-- =====================================================================
-- Restaura servidores que foram movidos para a lotação
-- "LICENÇAS E AFASTAMENTOS" de volta à lotação anterior (histórico).
--
-- Contexto: licença passou a ser só STATUS — o servidor deve permanecer
-- na lotação original. Quem já tinha sido transferido precisa deste script.
--
-- Como aplicar (Supabase → SQL Editor):
--   1) Rode o PREVIEW (bloco 1) e confira a lista
--   2) Se estiver correto, rode o RESTORE (bloco 2)
--   3) Rode de novo o PREVIEW — deve voltar vazio (ou só quem não tem histórico)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PREVIEW — quem está hoje na lotação de Licenças e qual seria a origem
-- ---------------------------------------------------------------------
SELECT
  f.id AS funcionario_id,
  f.nome,
  f.matricula,
  l.nome AS lotacao_atual,
  lp.nome AS lotacao_anterior,
  prev.lotacao_id AS lotacao_anterior_id,
  lic.tipo_afastamento,
  lic.data_inicial
FROM public.funcionario_lotacao fl
JOIN public.funcionarios f ON f.id = fl.funcionario_id
JOIN public.lotacoes l ON l.id = fl.lotacao_id
JOIN public.funcionario_licencas lic
  ON lic.funcionario_id = fl.funcionario_id AND lic.ativo = true
LEFT JOIN LATERAL (
  SELECT fl2.lotacao_id
  FROM public.funcionario_lotacao fl2
  JOIN public.lotacoes l2 ON l2.id = fl2.lotacao_id
  WHERE fl2.funcionario_id = fl.funcionario_id
    AND fl2.ativo = false
    AND l2.nome NOT ILIKE '%LICENÇAS E AFASTAMENTOS%'
  ORDER BY fl2.data_fim DESC NULLS LAST, fl2.id DESC
  LIMIT 1
) prev ON true
LEFT JOIN public.lotacoes lp ON lp.id = prev.lotacao_id
WHERE fl.ativo = true
  AND l.nome ILIKE '%LICENÇAS E AFASTAMENTOS%'
ORDER BY f.nome;


-- ---------------------------------------------------------------------
-- 2) RESTORE — devolve cada um à lotação anterior via fn_transferir_funcionario
--    (mantém o histórico correto). Não encerra a licença: ela continua ativa.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  prev_lotacao_id bigint;
  qtd_ok integer := 0;
  qtd_sem_hist integer := 0;
BEGIN
  FOR r IN
    SELECT fl.funcionario_id, f.nome
    FROM public.funcionario_lotacao fl
    JOIN public.lotacoes l ON l.id = fl.lotacao_id
    JOIN public.funcionarios f ON f.id = fl.funcionario_id
    WHERE fl.ativo = true
      AND l.nome ILIKE '%LICENÇAS E AFASTAMENTOS%'
      AND EXISTS (
        SELECT 1
        FROM public.funcionario_licencas lic
        WHERE lic.funcionario_id = fl.funcionario_id
          AND lic.ativo = true
      )
  LOOP
    SELECT fl2.lotacao_id
      INTO prev_lotacao_id
    FROM public.funcionario_lotacao fl2
    JOIN public.lotacoes l2 ON l2.id = fl2.lotacao_id
    WHERE fl2.funcionario_id = r.funcionario_id
      AND fl2.ativo = false
      AND l2.nome NOT ILIKE '%LICENÇAS E AFASTAMENTOS%'
    ORDER BY fl2.data_fim DESC NULLS LAST, fl2.id DESC
    LIMIT 1;

    IF prev_lotacao_id IS NULL THEN
      qtd_sem_hist := qtd_sem_hist + 1;
      RAISE NOTICE 'Sem lotação anterior para: % (id %)', r.nome, r.funcionario_id;
      CONTINUE;
    END IF;

    PERFORM public.fn_transferir_funcionario(
      p_funcionario_id   := r.funcionario_id,
      p_nova_lotacao_id  := prev_lotacao_id,
      p_novo_vinculo_id  := NULL,
      p_nova_funcao      := NULL,
      p_novo_turno_id    := NULL,
      p_motivo           := 'Restauração: licença não altera lotação'
    );

    qtd_ok := qtd_ok + 1;
  END LOOP;

  RAISE NOTICE 'Restaurados: %. Sem histórico anterior: %.', qtd_ok, qtd_sem_hist;
END $$;
